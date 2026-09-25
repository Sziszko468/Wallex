import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { apiClient } from "../../services/apiClient";
import { getConnectivitySnapshot, reportApiReachable } from "../../services/connectivity";
import { setOfflineUser } from "../../utils/offlineStore";
import { networkError } from "../helpers/tokens";

/** Replaces the HTTP layer: the real interceptors (cache, reachability) still run. */
function backend(handler: (config: InternalAxiosRequestConfig) => unknown): void {
  apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const data = handler(config);
    return { data, status: 200, statusText: "OK", headers: {}, config } as AxiosResponse;
  }) as AxiosAdapter;
}

function offline(): void {
  apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const error = networkError();
    error.config = config;
    throw error;
  }) as AxiosAdapter;
}

/** The cache writes in the background; wait for it the way the app naturally would. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("offline read cache", () => {
  beforeEach(() => {
    setOfflineUser(1);
    reportApiReachable();
  });

  it("answers a GET from the last successful response when offline", async () => {
    backend(() => ({ total_expenses: "123.45" }));
    await apiClient.get("/analytics/dashboard/", { params: { year: 2026, month: 9 } });
    await flush();

    offline();
    const response = await apiClient.get("/analytics/dashboard/", { params: { month: 9, year: 2026 } });

    expect(response.data).toEqual({ total_expenses: "123.45" });
    expect(getConnectivitySnapshot()).toMatchObject({ isApiReachable: false, cacheServedAt: expect.any(Number) });
  });

  it("different query = different cache entry (no wrong month shown)", async () => {
    backend(() => ({ month: 9 }));
    await apiClient.get("/analytics/dashboard/", { params: { year: 2026, month: 9 } });
    await flush();

    offline();
    await expect(apiClient.get("/analytics/dashboard/", { params: { year: 2026, month: 8 } })).rejects.toMatchObject({
      code: "ERR_NETWORK",
    });
  });

  it("never serves one user's cached data to another user", async () => {
    backend(() => [{ id: 1, description: "Anna's rent" }]);
    await apiClient.get("/transactions/");
    await flush();

    setOfflineUser(2);
    offline();

    await expect(apiClient.get("/transactions/")).rejects.toMatchObject({ code: "ERR_NETWORK" });
  });

  it("writes are never 'answered' from cache — they fail so the caller can queue them", async () => {
    offline();
    await expect(apiClient.post("/transactions/", {})).rejects.toMatchObject({ code: "ERR_NETWORK" });
  });

  it("a successful request marks the backend reachable again (clears the offline banner)", async () => {
    offline();
    await expect(apiClient.get("/categories/")).rejects.toBeDefined();
    expect(getConnectivitySnapshot().isApiReachable).toBe(false);

    backend(() => []);
    await apiClient.get("/categories/");

    expect(getConnectivitySnapshot()).toEqual({ isApiReachable: true, cacheServedAt: null });
  });
});
