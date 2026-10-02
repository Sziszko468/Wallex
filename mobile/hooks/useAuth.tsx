import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import axios from "axios";
import { t } from "i18next";
import * as authService from "../services/authService";
import {
  activateSession,
  clearSession,
  isRefreshTokenUsable,
  revokeAllSessions,
  revokeSession,
  SessionClosedError,
  SessionExpiredError,
  setOnSessionExpired,
  startSession,
  suspendSession,
} from "../services/session";
import {
  authenticateWithBiometrics,
  getBiometricCapability,
  type BiometricCapability,
  type BiometricResult,
} from "../services/biometrics";
import { unregisterCurrentDevice } from "../services/pushNotifications";
import {
  getBiometricLockEnabled,
  getRefreshToken,
  removeLegacyKeys,
  setBiometricLockEnabled,
} from "../utils/tokenStorage";
import {
  clearOtherUsersData,
  clearUserData,
  forgetLastUser,
  getLastUser,
  getOfflineUser,
  rememberLastUser,
  setOfflineUser,
} from "../utils/offlineStore";
import { getTokenUserId } from "../utils/jwt";
import { isOfflineError } from "../utils/network";
import type { AuthTokens, LoginPayload, RegisterPayload, User } from "../types/auth";
import type { Language } from "../i18n/languages";
import { APP_NAME } from "../config/app";
import { LOCK_AFTER_BACKGROUND_MS } from "../config/security";
import { logWarning } from "../utils/logging";
import { HTTP_STATUS } from "../config/http";

/**
 * - loading:     reading the stored session on launch
 * - signedOut:   no usable session — show login/register
 * - locked:      a session is stored, but the biometric check hasn't passed yet;
 *                no token has been read into memory or sent anywhere
 * - signedIn:    session active, `user` loaded
 * - unavailable: a stored session couldn't be verified because the backend
 *                was unreachable; kept intact so `retry` can resume it
 */
export type AuthStatus = "loading" | "signedOut" | "locked" | "signedIn" | "unavailable";

export type SignOutReason = "expired" | "biometricsUnavailable" | "storageError";

/** The password was checked: either signed in, or a two-factor code is needed. */
export type LoginOutcome = { status: "signedIn" } | { status: "mfaRequired"; mfaToken: string };

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  isAuthenticated: boolean;
  /** Why the user was signed out without asking for it — shown on the login screen. */
  signOutReason: SignOutReason | null;
  biometricCapability: BiometricCapability | null;
  isBiometricLockEnabled: boolean;
  login: (payload: LoginPayload) => Promise<LoginOutcome>;
  /** Second step of a sign-in with two-factor authentication. */
  verifyMfa: (mfaToken: string, code: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** Signs every device of the account out, this one too. Throws (and stays signed in) if the server can't be reached. */
  logoutEverywhere: () => Promise<void>;
  unlock: () => Promise<BiometricResult>;
  retry: () => Promise<void>;
  enableBiometricLock: () => Promise<BiometricResult>;
  disableBiometricLock: () => Promise<void>;
  /** Saves the interface language to the account (see hooks/useLanguage). */
  changeLanguage: (language: Language) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isRejectedByServer(error: unknown): boolean {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status === HTTP_STATUS.UNAUTHORIZED || status === HTTP_STATUS.FORBIDDEN;
}

function warnOnFailure(label: string) {
  return (error: unknown) => logWarning(label, error);
}

/**
 * The profile to open the app with when it starts without a connection — only
 * if it belongs to the stored session, never another account's saved data.
 */
async function getOfflineStartUser(): Promise<User | null> {
  try {
    const [lastUser, refresh] = await Promise.all([getLastUser(), getRefreshToken()]);
    if (!lastUser || !refresh || getTokenUserId(refresh) !== String(lastUser.id)) return null;
    return lastUser;
  } catch {
    return null;
  }
}

/** Whose offline data to delete on logout — also works from the lock screen, before any user is loaded. */
async function getSessionUserId(): Promise<number | null> {
  const loaded = getOfflineUser();
  if (loaded !== null) return loaded;
  try {
    const refresh = await getRefreshToken();
    const fromToken = refresh ? getTokenUserId(refresh) : null;
    return fromToken === null ? null : Number(fromToken);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [signOutReason, setSignOutReason] = useState<SignOutReason | null>(null);
  const [biometricCapability, setBiometricCapability] = useState<BiometricCapability | null>(null);
  const [isBiometricLockEnabled, setIsBiometricLockEnabled] = useState(false);

  const markSignedOut = useCallback((reason: SignOutReason | null) => {
    setOfflineUser(null);
    setUser(null);
    setIsBiometricLockEnabled(false);
    setSignOutReason(reason);
    setStatus("signedOut");
  }, []);

  useEffect(() => {
    setOnSessionExpired(() => {
      // Pending transactions and cached data stay (per user) so they're still
      // there if the same user signs back in; the offline-start profile goes.
      void forgetLastUser().catch(warnOnFailure("Failed to forget last user"));
      markSignedOut("expired");
    });
    return () => setOnSessionExpired(null);
  }, [markSignedOut]);

  const enterSignedIn = useCallback((currentUser: User) => {
    setOfflineUser(currentUser.id);
    // Best-effort bookkeeping for offline use; must never block signing in.
    void rememberLastUser(currentUser).catch(warnOnFailure("Failed to remember user"));
    void clearOtherUsersData(currentUser.id).catch(warnOnFailure("Failed to clear old offline data"));
    setUser(currentUser);
    setSignOutReason(null);
    setStatus("signedIn");
  }, []);

  /** Uses the stored refresh token (the request interceptor refreshes on the way) and loads the user. */
  const resume = useCallback(async () => {
    activateSession();
    try {
      enterSignedIn(await authService.getCurrentUser());
    } catch (error) {
      if (error instanceof SessionExpiredError || error instanceof SessionClosedError) {
        return; // session.ts already signed out / the session was ended meanwhile
      }
      if (isRejectedByServer(error)) {
        await clearSession();
        markSignedOut("expired");
        return;
      }
      if (isOfflineError(error)) {
        // Offline start: open with the saved profile and cached data. The
        // session stays active and is verified by the first request that
        // reaches the backend (an expired session then signs out as usual).
        const offlineUser = await getOfflineStartUser();
        if (offlineUser) {
          enterSignedIn(offlineUser);
          return;
        }
      }
      // Nothing saved to show (or a 5xx): keep the stored session and let the user retry.
      suspendSession();
      setStatus("unavailable");
    }
  }, [enterSignedIn, markSignedOut]);

  useEffect(() => {
    async function bootstrap() {
      const capability = await getBiometricCapability();
      setBiometricCapability(capability);

      let refresh: string | null;
      let lockEnabled: boolean;
      try {
        await removeLegacyKeys();
        [refresh, lockEnabled] = await Promise.all([getRefreshToken(), getBiometricLockEnabled()]);
      } catch {
        await clearSession();
        markSignedOut("storageError");
        return;
      }

      if (refresh === null) {
        markSignedOut(null);
        return;
      }
      if (!isRefreshTokenUsable(refresh)) {
        await clearSession();
        markSignedOut("expired");
        return;
      }
      if (lockEnabled) {
        // If biometrics disappeared (all fingerprints removed, Face ID turned
        // off for the app), never fall back to "unlocked" — that would make
        // the lock trivially bypassable. Require the password instead.
        if (!capability.isAvailable) {
          await clearSession();
          markSignedOut("biometricsUnavailable");
          return;
        }
        setIsBiometricLockEnabled(true);
        setStatus("locked");
        return;
      }
      await resume();
    }
    void bootstrap();
  }, [markSignedOut, resume]);

  // Re-lock after the app spent a while in the background. Only "background"
  // counts: iOS reports "inactive" while the Face ID sheet itself is showing.
  const backgroundedAt = useRef<number | null>(null);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (nextState !== "active" || backgroundedAt.current === null) return;

      const awayFor = Date.now() - backgroundedAt.current;
      backgroundedAt.current = null;
      if (isBiometricLockEnabled && status === "signedIn" && awayFor >= LOCK_AFTER_BACKGROUND_MS) {
        suspendSession();
        setUser(null);
        setStatus("locked");
      }
    });
    return () => subscription.remove();
  }, [isBiometricLockEnabled, status]);

  const completeSignIn = useCallback(async (tokens: AuthTokens) => {
    await startSession(tokens);
    let currentUser: User;
    try {
      currentUser = await authService.getCurrentUser();
    } catch (error) {
      await clearSession();
      throw error;
    }
    enterSignedIn(currentUser);
  }, [enterSignedIn]);

  const login = useCallback(
    async (payload: LoginPayload): Promise<LoginOutcome> => {
      const result = await authService.login(payload);
      if ("mfa_required" in result) {
        return { status: "mfaRequired", mfaToken: result.mfa_token };
      }
      await completeSignIn(result);
      return { status: "signedIn" };
    },
    [completeSignIn]
  );

  const verifyMfa = useCallback(
    async (mfaToken: string, code: string) => {
      await completeSignIn(await authService.verifyMfa({ mfa_token: mfaToken, code }));
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

  /** Everything this phone keeps about the signed-in user: the session, cached data, the last user. */
  const forgetLocally = useCallback(
    async (userId: number | null) => {
      await clearSession();
      // Cached data and unsynced transactions of this user (the UI warns first).
      if (userId !== null) await clearUserData(userId).catch(warnOnFailure("Failed to clear offline data"));
      await forgetLastUser().catch(warnOnFailure("Failed to forget last user"));
      markSignedOut(null);
    },
    [markSignedOut]
  );

  const logoutEverywhere = useCallback(async () => {
    const userId = await getSessionUserId();
    try {
      await unregisterCurrentDevice();
    } catch (error) {
      logWarning("Failed to unregister push device", error);
    }
    await revokeAllSessions(); // throws: still signed in everywhere, the screen says so
    await forgetLocally(userId);
  }, [forgetLocally]);

  const logout = useCallback(async () => {
    const userId = await getSessionUserId();
    try {
      // Also from the lock screen ("Sign in with password"): the stored token
      // is used one last time only to blacklist it, so a leaked copy is useless.
      activateSession();
      try {
        // Stop this phone from receiving the signed-out user's notifications.
        await unregisterCurrentDevice();
      } catch (error) {
        // The backend also stops pushing to devices that haven't checked in for
        // longer than a session can last, so this is not a lasting leak.
        logWarning("Failed to unregister push device", error);
      }
      await revokeSession();
    } catch (error) {
      // Offline or already invalid: the local session is removed regardless,
      // and the refresh token expires on its own server-side.
      logWarning("Server-side logout failed", error);
    } finally {
      await forgetLocally(userId);
    }
  }, [forgetLocally]);

  const unlock = useCallback(async () => {
    const label = biometricCapability?.label ?? t("settings.biometrics.generic");
    const result = await authenticateWithBiometrics(t("settings.biometrics.unlockPrompt"), label);
    if (result.success) {
      await resume();
    }
    return result;
  }, [biometricCapability, resume]);

  const retry = useCallback(async () => {
    setStatus("loading");
    await resume();
  }, [resume]);

  const enableBiometricLock = useCallback(async () => {
    const capability = await getBiometricCapability();
    setBiometricCapability(capability);
    if (!capability.isAvailable) {
      return {
        success: false,
        reason: "unavailable",
        message: t("settings.biometrics.notSetUp", { method: capability.label }),
      } satisfies BiometricResult;
    }
    // Confirm it works (and that it's the device owner) before relying on it.
    const result = await authenticateWithBiometrics(
      t("settings.biometrics.enablePrompt", { method: capability.label, appName: APP_NAME }),
      capability.label
    );
    if (result.success) {
      await setBiometricLockEnabled(true);
      setIsBiometricLockEnabled(true);
    }
    return result;
  }, []);

  const disableBiometricLock = useCallback(async () => {
    await setBiometricLockEnabled(false);
    setIsBiometricLockEnabled(false);
  }, []);

  const changeLanguage = useCallback(async (language: Language) => {
    setUser(await authService.updateCurrentUser({ language }));
  }, []);

  const value: AuthContextValue = {
    status,
    user,
    isAuthenticated: status === "signedIn",
    signOutReason,
    biometricCapability,
    isBiometricLockEnabled,
    login,
    verifyMfa,
    register,
    logout,
    logoutEverywhere,
    unlock,
    retry,
    enableBiometricLock,
    disableBiometricLock,
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
