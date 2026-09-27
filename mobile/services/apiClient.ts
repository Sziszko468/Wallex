import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "../utils/apiBaseUrl";
import { isOfflineError } from "../utils/network";
import { getValidAccessToken, isSessionActive, refreshSession } from "./session";
import { cacheKeyFor, readResponse, storeResponse } from "./responseCache";
import { reportApiReachable, reportApiUnreachable, reportServedFromCache } from "./connectivity";
import { notifyLocalWrite } from "./localWrites";

export { API_BASE_URL };

const REQUEST_TIMEOUT_MS = 20_000;

export const apiClient = axios.create({ baseURL: API_BASE_URL, timeout: REQUEST_TIMEOUT_MS });

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// "Has anything changed?" is meaningless from the cache: an old answer would hide real changes.
const NEVER_CACHED = ["/sync/status/"];
// Requests that change no user data (signing in and out, token refresh).
const NOT_DATA_WRITES = ["/auth/login/", "/auth/register/", "/auth/refresh/", "/auth/logout/"];
const READ_METHODS = ["get", "head", "options"];

function isCacheable(config: InternalAxiosRequestConfig): boolean {
  return config.method === "get" && !NEVER_CACHED.some((path) => config.url?.includes(path));
}

// Proactive: attach a token that is guaranteed not to expire mid-flight.
apiClient.interceptors.request.use(async (config) => {
  let token: string | null = null;
  try {
    token = await getValidAccessToken();
  } catch (error) {
    // Offline, so the token can't be refreshed right now. Send the request
    // anyway: it fails as offline too, and the response interceptor can then
    // answer it from the cache (with this request's own config/cache key).
    if (!isOfflineError(error)) throw error;
  }
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    reportApiReachable();
    const { method = "get", url = "" } = response.config;
    if (isCacheable(response.config)) {
      storeResponse(cacheKeyFor(response.config), response.data);
    } else if (!READ_METHODS.includes(method.toLowerCase()) && !NOT_DATA_WRITES.some((path) => url.includes(path))) {
      // A write went through: let SyncProvider reload every screen it may have affected.
      notifyLocalWrite();
    }
    return response;
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }
    const originalRequest = error.config as RetryableRequestConfig;

    // Offline: show the last data loaded for this exact request, if any.
    if (isOfflineError(error)) {
      reportApiUnreachable();
      if (isCacheable(originalRequest)) {
        const cached = await readResponse(cacheKeyFor(originalRequest));
        if (cached) {
          reportServedFromCache(cached.storedAt);
          const response: AxiosResponse = {
            data: cached.data,
            status: 200,
            statusText: "OK",
            headers: {},
            config: originalRequest,
          };
          return response;
        }
      }
      return Promise.reject(error);
    }

    reportApiReachable();

    // Reactive fallback: the server can still reject a token the client thought
    // was valid (clock skew, server-side revocation) — refresh once and retry.
    // If the refresh itself is rejected, session.ts signs the user out.
    if (error.response?.status !== 401 || originalRequest._retry || !isSessionActive()) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    const newAccessToken = await refreshSession();
    originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
    return apiClient(originalRequest);
  }
);
