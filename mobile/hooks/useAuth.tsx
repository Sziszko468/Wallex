import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import * as authService from "../services/authService";
import { setOnAuthFailure } from "../services/apiClient";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "../utils/tokenStorage";
import type { LoginPayload, RegisterPayload, User } from "../types/auth";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setOnAuthFailure(() => setUser(null));
  }, []);

  useEffect(() => {
    async function bootstrap() {
      const token = await getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        // Only a real response (e.g. 401 for an invalid/expired token) means
        // the session is actually gone. A network error (backend briefly
        // unreachable, offline, ...) shouldn't wipe otherwise-valid tokens —
        // that would force a fresh login for something that fixes itself.
        if (axios.isAxiosError(error) && error.response) {
          await clearTokens();
        }
      } finally {
        setIsLoading(false);
      }
    }
    void bootstrap();
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const tokens = await authService.login(payload);
    await setTokens(tokens);
    const currentUser = await authService.getCurrentUser();
    setUser(currentUser);
  }, []);

  const register = useCallback(
    async (payload: RegisterPayload) => {
      await authService.register(payload);
      await login({ email: payload.email, password: payload.password });
    },
    [login]
  );

  const logout = useCallback(async () => {
    const refresh = await getRefreshToken();
    try {
      if (refresh) {
        await authService.logout(refresh);
      }
    } catch {
      // Best-effort: even if the blacklist call fails, clear local state.
    } finally {
      await clearTokens();
      setUser(null);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    register,
    logout,
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
