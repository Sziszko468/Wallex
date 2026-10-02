/**
 * The web app never stores a token where page scripts could steal it later:
 *
 * - the access token (15 minutes) lives only in this module's memory;
 * - the refresh token is an HttpOnly cookie that only the browser sees (services/apiClient.ts
 *   asks for it with `X-Auth-Transport: cookie`).
 *
 * A page reload therefore starts without an access token and gets a new one from the cookie
 * (useAuth's bootstrap). Each tab has its own access token.
 */

let accessToken: string | null = null;

// Where earlier versions (before the app was renamed) kept both tokens. Removed on start so no old
// refresh token lingers.
const LEGACY_KEYS = ["spendly_access_token", "spendly_refresh_token"];

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(access: string): void {
  accessToken = access;
}

export function clearTokens(): void {
  accessToken = null;
}

export function removeLegacyTokens(): void {
  try {
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked (private mode, policies): nothing was stored there either.
  }
}
