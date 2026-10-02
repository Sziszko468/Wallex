import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, setOnAuthFailure } from "./apiClient";
import { getAccessToken, setAccessToken } from "../utils/tokenStorage";
import { API, server } from "../test/server";
import { subscribeLocalWrites } from "./localWrites";

describe("apiClient", () => {
  beforeEach(() => {
    setAccessToken("old-access");
  });

  it("sends the access token from memory", async () => {
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

  it("refreshes an expired access token with the refresh cookie and retries once", async () => {
    const refreshes: { transport: string | null; body: unknown }[] = [];
    server.use(
      http.get(`${API}/categories/`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer new-access"
          ? HttpResponse.json([{ id: 1 }])
          : HttpResponse.json({ detail: "Token expired" }, { status: 401 })
      ),
      http.post(`${API}/auth/refresh/`, async ({ request }) => {
        refreshes.push({ transport: request.headers.get("X-Auth-Transport"), body: await request.json() });
        return HttpResponse.json({ access: "new-access" });
      })
    );

    const response = await apiClient.get("/categories/");

    expect(response.data).toEqual([{ id: 1 }]);
    expect(getAccessToken()).toBe("new-access");
    // The browser sends the HttpOnly cookie; the page never holds a refresh token to send.
    expect(refreshes).toEqual([{ transport: "cookie", body: {} }]);
    expect(Object.keys(localStorage)).toEqual([]);
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
        return HttpResponse.json({ access: "new-access" });
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

  it("signs the user out when the session has ended", async () => {
    const onAuthFailure = vi.fn();
    setOnAuthFailure(onAuthFailure);
    server.use(
      http.get(`${API}/categories/`, () => HttpResponse.json({ detail: "expired" }, { status: 401 })),
      http.post(`${API}/auth/refresh/`, () =>
        HttpResponse.json({ detail: "Your session has ended.", code: "session_ended" }, { status: 401 })
      )
    );

    await expect(apiClient.get("/categories/")).rejects.toThrow();

    expect(onAuthFailure).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
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

describe("apiClient and other tabs / devices", () => {
  beforeEach(() => {
    setAccessToken("old-access");
  });

  it("reports data writes (so every view can reload) — not reads, failures or account calls", async () => {
    const writes = vi.fn();
    const unsubscribe = subscribeLocalWrites(writes);
    server.use(
      http.post(`${API}/budgets/`, () => HttpResponse.json({ id: 1 }, { status: 201 })),
      http.delete(`${API}/budgets/:id/`, () => HttpResponse.json({ detail: "Not found." }, { status: 404 })),
      http.post(`${API}/auth/logout/`, () => HttpResponse.json({ detail: "ok" })),
      http.post(`${API}/auth/password/`, () => HttpResponse.json({ revoked_sessions: 1 }))
    );

    await apiClient.get("/categories/");
    await apiClient.post("/budgets/", {});
    await apiClient.delete("/budgets/5/").catch(() => undefined);
    await apiClient.post("/auth/logout/", {});
    await apiClient.post("/auth/password/", {});
    await apiClient.patch("/auth/me/", { base_currency: "HUF" }); // changes every amount shown
    unsubscribe();

    expect(writes).toHaveBeenCalledTimes(2);
  });

  it("refreshes under a lock shared by the browser's tabs", async () => {
    const order: string[] = [];
    server.use(
      http.get(`${API}/categories/`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer new-access"
          ? HttpResponse.json([{ id: 1 }])
          : HttpResponse.json({ detail: "Token expired" }, { status: 401 })
      ),
      http.post(`${API}/auth/refresh/`, () => {
        order.push("refresh");
        return HttpResponse.json({ access: "new-access" });
      })
    );
    // Another tab holds the lock first; this tab's refresh starts only after it is released.
    const request = vi.fn(async (_name: string, task: () => Promise<unknown>) => {
      order.push("other tab done");
      return task();
    });
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    try {
      const response = await apiClient.get("/categories/");

      expect(response.data).toEqual([{ id: 1 }]);
      expect(request).toHaveBeenCalledWith("wallex-token-refresh", expect.any(Function));
      expect(order).toEqual(["other tab done", "refresh"]);
    } finally {
      Reflect.deleteProperty(navigator, "locks");
    }
  });
});
