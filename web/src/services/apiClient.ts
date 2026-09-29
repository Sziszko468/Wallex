import axios, { type InternalAxiosRequestConfig } from "axios";
import { clearTokens, getAccessToken, setAccessToken } from "../utils/tokenStorage";
import { notifyLocalWrite } from "./localWrites";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api";

/**
 * Sent with every sign-in, refresh and sign-out: the server then keeps the refresh token in an
 * HttpOnly cookie (only for /api/auth/) instead of the JSON body, and labels the session "web"
 * in the user's device list. `withCredentials` lets the browser send and store that cookie.
 */
export const AUTH_REQUEST = {
  withCredentials: true,
  headers: { "X-Auth-Transport": "cookie", "X-Client-Platform": "web" },
} as const;

export const apiClient = axios.create({ baseURL: API_BASE_URL });

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

type AuthFailureHandler = () => void;
let onAuthFailure: AuthFailureHandler | null = null;

export function setOnAuthFailure(handler: AuthFailureHandler): void {
  onAuthFailure = handler;
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

const REFRESH_LOCK = "spendly-token-refresh";

/**
 * All tabs of this browser share one refresh-token cookie, and a refresh token works only
 * once (the server rotates it — and treats a second use as theft). A Web Lock makes the tabs
 * refresh one after the other; the browser always sends the newest cookie, so a tab that
 * waited simply refreshes with the token the previous tab received.
 */
function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request(REFRESH_LOCK, task) : task();
}

let refreshPromise: Promise<string> | null = null;

/** A new access token from the refresh cookie. Rejects when the browser is not signed in. */
export function refreshSession(): Promise<string> {
  refreshPromise ??= withRefreshLock(async () => {
    const response = await axios.post<{ access: string }>(`${API_BASE_URL}/auth/refresh/`, {}, AUTH_REQUEST);
    setAccessToken(response.data.access);
    return response.data.access;
  }).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

// Sign-in, sessions, password and 2FA change no financial data (the profile at /auth/me/ does);
// neither does asking the AI assistant.
function isDataWrite(method: string, url: string): boolean {
  if (["get", "head", "options"].includes(method.toLowerCase())) return false;
  if (url.includes("/assistant/")) return false;
  return !url.includes("/auth/") || url.includes("/auth/me/");
}

apiClient.interceptors.response.use(
  (response) => {
    const { method = "get", url = "" } = response.config;
    if (isDataWrite(method, url)) {
      notifyLocalWrite();
    }
    return response;
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as RetryableRequestConfig;
    const isRefreshCall = originalRequest.url?.includes("/auth/refresh/");

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshCall) {
      originalRequest._retry = true;
      try {
        const newAccessToken = await refreshSession();
        originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
        return await apiClient(originalRequest);
      } catch (refreshError) {
        // Signed out elsewhere, session revoked, or older than 30 days: back to the login page.
        clearTokens();
        onAuthFailure?.();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
