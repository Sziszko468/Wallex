import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as authService from "../services/authService";
import { refreshSession, setOnAuthFailure } from "../services/apiClient";
import { clearTokens, removeLegacyTokens, setAccessToken } from "../utils/tokenStorage";
import type { LoginPayload, RegisterPayload, User } from "../types/auth";
import type { CurrencyCode } from "../types/currency";
import type { Language } from "../i18n/languages";

/** The password was checked: either signed in, or a two-factor code is needed. */
export type LoginOutcome = { status: "signedIn" } | { status: "mfaRequired"; mfaToken: string };

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<LoginOutcome>;
  /** Second step of a sign-in with two-factor authentication. */
  verifyMfa: (mfaToken: string, code: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** Signs every device out (this one too). Returns how many sessions ended. */
  logoutEverywhere: () => Promise<number>;
  /** Converts the user's data on the server, then updates `user`. */
  changeBaseCurrency: (currency: CurrencyCode) => Promise<void>;
  /** Saves the interface language to the account (see hooks/useLanguage). */
  changeLanguage: (language: Language) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setOnAuthFailure(() => setUser(null));
  }, []);

  useEffect(() => {
    // The access token lives in memory, so every page load asks the refresh cookie for a new
    // one. No cookie (or an ended session) means signed out. The cookie is HttpOnly: a network
    // error can't destroy it, the next load simply tries again.
    async function bootstrap() {
      removeLegacyTokens();
      try {
        await refreshSession();
        setUser(await authService.getCurrentUser());
      } catch {
        clearTokens();
      } finally {
        setIsLoading(false);
      }
    }
    void bootstrap();
  }, []);

  const completeSignIn = useCallback(async (access: string) => {
    setAccessToken(access);
    setUser(await authService.getCurrentUser());
  }, []);

  const login = useCallback(
    async (payload: LoginPayload): Promise<LoginOutcome> => {
      const result = await authService.login(payload);
      if ("mfa_required" in result) {
        return { status: "mfaRequired", mfaToken: result.mfa_token };
      }
      await completeSignIn(result.access);
      return { status: "signedIn" };
    },
    [completeSignIn]
  );

  const verifyMfa = useCallback(
    async (mfaToken: string, code: string) => {
      const { access } = await authService.verifyMfa({ mfa_token: mfaToken, code });
      await completeSignIn(access);
    },
    [completeSignIn]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      await authService.register(payload);
      await login({ email: payload.email, password: payload.password });
    },
    [login]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Best-effort: even if the server call fails, forget the session here.
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  const logoutEverywhere = useCallback(async () => {
    const count = await authService.logoutEverywhere();
    clearTokens();
    setUser(null);
    return count;
  }, []);

  const changeBaseCurrency = useCallback(async (currency: CurrencyCode) => {
    setUser(await authService.updateCurrentUser({ base_currency: currency }));
  }, []);

  const changeLanguage = useCallback(async (language: Language) => {
    setUser(await authService.updateCurrentUser({ language }));
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    verifyMfa,
    register,
    logout,
    logoutEverywhere,
    changeBaseCurrency,
    changeLanguage,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
