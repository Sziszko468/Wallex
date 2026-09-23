import Constants from "expo-constants";

const PORT = "8000";

/**
 * Resolves the Django API base URL for the current run target.
 *
 * - `EXPO_PUBLIC_API_BASE_URL` always wins when set (e.g. for the Android
 *   emulator, which needs `http://10.0.2.2:8000/api` instead of localhost).
 * - Otherwise, derive the dev machine's LAN IP from Expo's own dev-server
 *   connection info. This is what lets Expo Go on a *physical* phone reach
 *   the backend without hand-editing an IP every time it changes.
 * - Final fallback is localhost, which is correct for the iOS simulator.
 */
function resolveApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (explicit) return explicit;

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(":")[0];
  if (host) {
    return `http://${host}:${PORT}/api`;
  }

  return `http://localhost:${PORT}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl();
