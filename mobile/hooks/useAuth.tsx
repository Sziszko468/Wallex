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
import * as authService from "../services/authService";
import {
  activateSession,
  clearSession,
  isRefreshTokenUsable,
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
  removeLegacyAccessToken,
  setBiometricLockEnabled,
} from "../utils/tokenStorage";
import type { LoginPayload, RegisterPayload, User } from "../types/auth";

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

// Re-lock when the app comes back after being in the background this long.
const LOCK_AFTER_BACKGROUND_MS = 60_000;

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  isAuthenticated: boolean;
  /** Why the user was signed out without asking for it — shown on the login screen. */
  signOutReason: SignOutReason | null;
  biometricCapability: BiometricCapability | null;
  isBiometricLockEnabled: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  unlock: () => Promise<BiometricResult>;
  retry: () => Promise<void>;
  enableBiometricLock: () => Promise<BiometricResult>;
  disableBiometricLock: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isRejectedByServer(error: unknown): boolean {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status === 401 || status === 403;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [signOutReason, setSignOutReason] = useState<SignOutReason | null>(null);
  const [biometricCapability, setBiometricCapability] = useState<BiometricCapability | null>(null);
  const [isBiometricLockEnabled, setIsBiometricLockEnabled] = useState(false);

  const markSignedOut = useCallback((reason: SignOutReason | null) => {
    setUser(null);
    setIsBiometricLockEnabled(false);
    setSignOutReason(reason);
    setStatus("signedOut");
  }, []);

  useEffect(() => {
    setOnSessionExpired(() => markSignedOut("expired"));
    return () => setOnSessionExpired(null);
  }, [markSignedOut]);

  /** Uses the stored refresh token (the request interceptor refreshes on the way) and loads the user. */
  const resume = useCallback(async () => {
    activateSession();
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      setSignOutReason(null);
      setStatus("signedIn");
    } catch (error) {
      if (error instanceof SessionExpiredError || error instanceof SessionClosedError) {
        return; // session.ts already signed out / the session was ended meanwhile
      }
      if (isRejectedByServer(error)) {
        await clearSession();
        markSignedOut("expired");
        return;
      }
      // Offline, timeout, 5xx: keep the stored session and let the user retry.
      suspendSession();
      setStatus("unavailable");
    }
  }, [markSignedOut]);

  useEffect(() => {
    async function bootstrap() {
      const capability = await getBiometricCapability();
      setBiometricCapability(capability);

      let refresh: string | null;
      let lockEnabled: boolean;
      try {
        await removeLegacyAccessToken();
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

  const login = useCallback(async (payload: LoginPayload) => {
    const tokens = await authService.login(payload);
    await startSession(tokens);
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      await clearSession();
      throw error;
    }
    setSignOutReason(null);
    setStatus("signedIn");
  }, []);

  const register = useCallback(
    async (payload: RegisterPayload) => {
      await authService.register(payload);
      await login({ email: payload.email, password: payload.password });
    },
    [login]
  );

  const logout = useCallback(async () => {
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
        console.warn("Failed to unregister push device", error);
      }
      await revokeSession();
    } catch (error) {
      // Offline or already invalid: the local session is removed regardless,
      // and the refresh token expires on its own server-side.
      console.warn("Server-side logout failed", error);
    } finally {
      await clearSession();
      markSignedOut(null);
    }
  }, [markSignedOut]);

  const unlock = useCallback(async () => {
    const label = biometricCapability?.label ?? "Biometrics";
    const result = await authenticateWithBiometrics("Unlock Spendly", label);
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
        message: `${capability.label} isn't set up on this device.`,
      } satisfies BiometricResult;
    }
    // Confirm it works (and that it's the device owner) before relying on it.
    const result = await authenticateWithBiometrics(`Enable ${capability.label} for Spendly`, capability.label);
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

  const value: AuthContextValue = {
    status,
    user,
    isAuthenticated: status === "signedIn",
    signOutReason,
    biometricCapability,
    isBiometricLockEnabled,
    login,
    register,
    logout,
    unlock,
    retry,
    enableBiometricLock,
    disableBiometricLock,
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
