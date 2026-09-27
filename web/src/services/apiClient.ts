import axios, { type InternalAxiosRequestConfig } from "axios";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "../utils/tokenStorage";
import { notifyLocalWrite } from "./localWrites";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api";

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

let refreshPromise: Promise<string> | null = null;

const REFRESH_LOCK = "spendly-token-refresh";

/**
 * Every tab of this browser shares the tokens in localStorage, and a refresh token works
 * only once (the backend rotates and blacklists it). Two tabs refreshing at the same moment
 * would therefore log one of them out. A Web Lock makes the tabs take turns; a tab that
 * waited finds a refresh token other than the one it started with — another tab already
 * refreshed — and simply uses the new access token.
 */
function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request(REFRESH_LOCK, task) : task();
}

async function refreshAccessToken(): Promise<string> {
  const startedWith = getRefreshToken();
  return withRefreshLock(async () => {
    const refresh = getRefreshToken();
    if (!refresh) {
      throw new Error("No refresh token available");
    }
    const access = getAccessToken();
    if (refresh !== startedWith && access) {
      return access; // refreshed by another tab while we waited
    }
    const response = await axios.post<{ access: string; refresh?: string }>(
      `${API_BASE_URL}/auth/refresh/`,
      { refresh }
    );
    setAccessToken(response.data.access);
    if (response.data.refresh) {
      setRefreshToken(response.data.refresh);
    }
    return response.data.access;
  });
}

// Requests that change no user data (signing in and out, token refresh).
const NOT_DATA_WRITES = ["/auth/login/", "/auth/register/", "/auth/refresh/", "/auth/logout/"];
const READ_METHODS = ["get", "head", "options"];

apiClient.interceptors.response.use(
  (response) => {
    const { method = "get", url = "" } = response.config;
    if (!READ_METHODS.includes(method.toLowerCase()) && !NOT_DATA_WRITES.some((path) => url.includes(path))) {
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
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const newAccessToken = await refreshPromise;
        originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
        return await apiClient(originalRequest);
      } catch (refreshError) {
        clearTokens();
        onAuthFailure?.();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
