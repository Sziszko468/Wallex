import axios, { type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "../utils/apiBaseUrl";
import { getValidAccessToken, isSessionActive, refreshSession } from "./session";

export { API_BASE_URL };

const REQUEST_TIMEOUT_MS = 20_000;

export const apiClient = axios.create({ baseURL: API_BASE_URL, timeout: REQUEST_TIMEOUT_MS });

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Proactive: attach a token that is guaranteed not to expire mid-flight.
apiClient.interceptors.request.use(async (config) => {
  const token = await getValidAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

// Reactive fallback: the server can still reject a token the client thought
// was valid (clock skew, server-side revocation) — refresh once and retry.
// If the refresh itself is rejected, session.ts signs the user out.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as RetryableRequestConfig;
    if (error.response?.status !== 401 || originalRequest._retry || !isSessionActive()) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    const newAccessToken = await refreshSession();
    originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
    return apiClient(originalRequest);
  }
);
