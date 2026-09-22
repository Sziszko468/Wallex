import axios, { type InternalAxiosRequestConfig } from "axios";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "../utils/tokenStorage";

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

async function refreshAccessToken(): Promise<string> {
  const refresh = getRefreshToken();
  if (!refresh) {
    throw new Error("No refresh token available");
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
}

apiClient.interceptors.response.use(
  (response) => response,
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
