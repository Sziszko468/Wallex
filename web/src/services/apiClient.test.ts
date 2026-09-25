import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, setOnAuthFailure } from "./apiClient";
import { getAccessToken, getRefreshToken, setTokens } from "../utils/tokenStorage";
import { API, server } from "../test/server";

describe("apiClient", () => {
  beforeEach(() => {
    setTokens({ access: "old-access", refresh: "old-refresh" });
  });

  it("sends the stored access token", async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(`${API}/categories/`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json([]);
      })
    );

    await apiClient.get("/categories/");

    expect(authHeader).toBe("Bearer old-access");
  });

  it("refreshes an expired access token once and retries the request", async () => {
    server.use(
      http.get(`${API}/categories/`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer new-access"
          ? HttpResponse.json([{ id: 1 }])
          : HttpResponse.json({ detail: "Token expired" }, { status: 401 })
      ),
      http.post(`${API}/auth/refresh/`, () => HttpResponse.json({ access: "new-access", refresh: "new-refresh" }))
    );

    const response = await apiClient.get("/categories/");

    expect(response.data).toEqual([{ id: 1 }]);
    expect(getAccessToken()).toBe("new-access");
    // The backend rotates refresh tokens — the new one must replace the old.
    expect(getRefreshToken()).toBe("new-refresh");
  });

  it("shares ONE refresh between concurrent 401s (rotation would break a second one)", async () => {
    const refreshCalls = vi.fn();
    server.use(
      http.get(`${API}/analytics/:name/`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer new-access"
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({ detail: "Token expired" }, { status: 401 })
      ),
      http.post(`${API}/auth/refresh/`, async () => {
        refreshCalls();
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json({ access: "new-access", refresh: "new-refresh" });
      })
    );

    const results = await Promise.all([
      apiClient.get("/analytics/dashboard/"),
      apiClient.get("/analytics/monthly/"),
      apiClient.get("/analytics/insights/"),
    ]);

    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toHaveBeenCalledTimes(1);
  });

  it("signs the user out when the refresh token is rejected", async () => {
    const onAuthFailure = vi.fn();
    setOnAuthFailure(onAuthFailure);
    server.use(
      http.get(`${API}/categories/`, () => HttpResponse.json({ detail: "expired" }, { status: 401 })),
      http.post(`${API}/auth/refresh/`, () => HttpResponse.json({ detail: "blacklisted" }, { status: 401 }))
    );

    await expect(apiClient.get("/categories/")).rejects.toThrow();

    expect(onAuthFailure).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("does not retry forever when the new token is rejected too", async () => {
    const hits = vi.fn();
    server.use(
      http.get(`${API}/categories/`, () => {
        hits();
        return HttpResponse.json({ detail: "nope" }, { status: 401 });
      }),
      http.post(`${API}/auth/refresh/`, () => HttpResponse.json({ access: "new-access" }))
    );

    await expect(apiClient.get("/categories/")).rejects.toMatchObject({ response: { status: 401 } });
    expect(hits).toHaveBeenCalledTimes(2); // original + exactly one retry
  });

  it("passes non-auth errors through untouched", async () => {
    server.use(
      http.post(`${API}/transactions/`, () =>
        HttpResponse.json({ amount: ["Ensure this value is greater than or equal to 0.01."] }, { status: 400 })
      )
    );

    await expect(apiClient.post("/transactions/", {})).rejects.toMatchObject({
      response: { status: 400, data: { amount: ["Ensure this value is greater than or equal to 0.01."] } },
    });
    expect(getAccessToken()).toBe("old-access");
  });
});
