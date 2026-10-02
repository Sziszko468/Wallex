import { t } from "i18next";
import axios from "axios";
import { API_BASE_URL } from "../utils/apiBaseUrl";
import { AppError } from "../utils/appError";
import { expiresWithin } from "../utils/jwt";
import * as tokenStorage from "../utils/tokenStorage";
import type { AuthTokens } from "../types/auth";
import { logWarning } from "../utils/logging";
import { HTTP_STATUS } from "../config/http";

/**
 * Owns the token lifecycle, independent of React:
 *
 * - the access token is kept in memory only; the refresh token in secure storage
 * - access tokens are refreshed proactively shortly before they expire, and
 *   reactively when the API still answers 401
 * - concurrent refreshes share one request — the backend rotates and
 *   blacklists refresh tokens, so a second parallel refresh would fail
 * - a session is "active" only after the app decided it may use the stored
 *   token (i.e. after the biometric unlock, when that's enabled)
 */

const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000;
const REFRESH_TIMEOUT_MS = 15_000;
const LOGOUT_TIMEOUT_MS = 5_000;

/** The backend no longer accepts the stored refresh token; the user must sign in again. */
export class SessionExpiredError extends AppError {
  constructor() {
    super(t("errors.sessionExpired"));
  }
}

/** The session was ended locally (logout, lock) while a request was in flight. */
export class SessionClosedError extends AppError {
  constructor() {
    super(t("errors.signedOut"));
  }
}

let isActive = false;
let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;
// Bumped whenever the session ends, so a refresh that was already in flight
// can't write its (rotated) refresh token back into storage afterwards.
let generation = 0;
let onExpired: (() => void) | null = null;

export function setOnSessionExpired(handler: (() => void) | null): void {
  onExpired = handler;
}

export function isSessionActive(): boolean {
  return isActive;
}

/** Stores the tokens from a fresh login and activates the session. */
export async function startSession(tokens: AuthTokens): Promise<void> {
  await tokenStorage.setRefreshToken(tokens.refresh);
  accessToken = tokens.access;
  isActive = true;
}

/** Allows the stored refresh token to be used; the access token is fetched on the first request. */
export function activateSession(): void {
  isActive = true;
}

/** Drops in-memory credentials but keeps the stored session (used by the biometric lock). */
export function suspendSession(): void {
  isActive = false;
  accessToken = null;
  generation += 1;
}

/** Forgets the session on this device. Never throws: failing to clean up must not block signing out. */
export async function clearSession(): Promise<void> {
  suspendSession();
  try {
    await tokenStorage.clearAll();
  } catch (error) {
    logWarning("Failed to clear stored session", error);
  }
}

/** True when a stored refresh token is present and not yet past its own expiry. */
export function isRefreshTokenUsable(refresh: string | null): refresh is string {
  return refresh !== null && !expiresWithin(refresh, 0);
}

async function performRefresh(): Promise<string> {
  const startedIn = generation;
  const refresh = await tokenStorage.getRefreshToken();
  if (!isRefreshTokenUsable(refresh)) {
    throw new SessionExpiredError();
  }

  let tokens: { access: string; refresh?: string };
  try {
    const response = await axios.post<{ access: string; refresh?: string }>(
      `${API_BASE_URL}/auth/refresh/`,
      { refresh },
      { timeout: REFRESH_TIMEOUT_MS }
    );
    tokens = response.data;
  } catch (error) {
    // 400/401 = the server rejected the token (expired, blacklisted, user gone).
    // Anything else (offline, timeout, 5xx) is transient: keep the session so a
    // later attempt can still succeed, and let the caller show a network error.
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === HTTP_STATUS.BAD_REQUEST || status === HTTP_STATUS.UNAUTHORIZED) {
      throw new SessionExpiredError();
    }
    throw error;
  }

  if (startedIn !== generation) {
    throw new SessionClosedError();
  }

  accessToken = tokens.access;
  if (tokens.refresh) {
    try {
      await tokenStorage.setRefreshToken(tokens.refresh);
    } catch (error) {
      // The old refresh token is already blacklisted server-side. Keep working
      // with the new access token for now; the next launch will ask the user to
      // sign in again instead of failing mid-session.
      logWarning("Failed to persist rotated refresh token", error);
    }
  }
  return tokens.access;
}

/** Exchanges the stored refresh token for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<string> {
  if (!isActive) {
    return Promise.reject(new SessionClosedError());
  }
  refreshPromise ??= performRefresh()
    .catch(async (error: unknown) => {
      if (error instanceof SessionExpiredError) {
        await clearSession();
        onExpired?.();
      }
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/** Access token for an outgoing request (refreshed first if it's about to expire); null without an active session. */
export async function getValidAccessToken(): Promise<string | null> {
  if (!isActive) return null;
  if (accessToken && !expiresWithin(accessToken, ACCESS_TOKEN_REFRESH_MARGIN_MS)) {
    return accessToken;
  }
  return refreshSession();
}

/**
 * Best-effort server-side logout: blacklists the current refresh token so it
 * can't be reused even if it leaked. Local cleanup is the caller's job and
 * must happen regardless of the outcome here.
 */
/**
 * Signs every device of the account out on the server — this phone included. Unlike
 * revokeSession it must reach the server: when it throws, nothing was signed out.
 */
export async function revokeAllSessions(): Promise<number> {
  const access = await getValidAccessToken();
  if (!access) throw new SessionExpiredError();
  const response = await axios.post<{ revoked_sessions: number }>(
    `${API_BASE_URL}/auth/logout-all/`,
    {},
    { headers: { Authorization: `Bearer ${access}` }, timeout: LOGOUT_TIMEOUT_MS }
  );
  return response.data.revoked_sessions;
}

export async function revokeSession(): Promise<void> {
  if (!isActive) return;
  // Settle any pending rotation first, so we revoke the token that is
  // actually current rather than one the server already replaced.
  const access = await getValidAccessToken();
  const refresh = await tokenStorage.getRefreshToken();
  if (!access || !refresh) return;
  await axios.post(
    `${API_BASE_URL}/auth/logout/`,
    { refresh },
    { headers: { Authorization: `Bearer ${access}` }, timeout: LOGOUT_TIMEOUT_MS }
  );
}
