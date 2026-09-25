import Constants from "expo-constants";

const PORT = "8000";

interface ApiBaseUrlInput {
  isDev: boolean;
  /** EXPO_PUBLIC_API_BASE_URL — always wins when set. */
  explicit: string | undefined;
  /** Expo dev-server host ("192.168.1.20:8081"): reaches the dev machine from a physical phone. */
  hostUri: string | undefined;
}

/**
 * Resolves the Django API base URL.
 *
 * Development may use plain http to reach the local backend (LAN IP, Android
 * emulator's 10.0.2.2, iOS simulator's localhost). A release build must talk
 * https: every request carries a bearer token, and /auth/refresh/ carries the
 * refresh token in its body — over http anyone on the network could read them.
 */
export function resolveApiBaseUrl({ isDev, explicit, hostUri }: ApiBaseUrlInput): string {
  let url: string;
  if (explicit) {
    url = explicit;
  } else {
    const host = hostUri?.split(":")[0];
    url = host ? `http://${host}:${PORT}/api` : `http://localhost:${PORT}/api`;
  }

  if (!isDev && !url.startsWith("https://")) {
    throw new Error(`Release builds must use an https API URL (got "${url}"). Set EXPO_PUBLIC_API_BASE_URL.`);
  }
  return url;
}

export const API_BASE_URL = resolveApiBaseUrl({
  isDev: __DEV__,
  explicit: process.env.EXPO_PUBLIC_API_BASE_URL,
  hostUri: Constants.expoConfig?.hostUri,
});
