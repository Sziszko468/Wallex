import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  categories,
  categoryBreakdown,
  comparison,
  conversionPreview,
  dashboard,
  emptyPage,
  insights,
  makeSyncStatus,
  merchants,
  monthly,
  savingsSummary,
  spendingPatterns,
  trends,
  user,
} from "./fixtures";
import type { UpdateUserPayload } from "../types/auth";

export const API = "http://localhost:8000/api";

/**
 * A fake backend at the network level: the real axios client, interceptors
 * and token-refresh logic all run exactly as in the browser. Tests override
 * individual endpoints with `server.use(...)`.
 */
export const defaultHandlers = [
  http.get(`${API}/auth/me/`, () => HttpResponse.json(user)),
  http.patch(`${API}/auth/me/`, async ({ request }) =>
    HttpResponse.json({ ...user, ...((await request.json()) as UpdateUserPayload) })
  ),
  http.get(`${API}/currencies/convert/`, () => HttpResponse.json(conversionPreview)),
  http.post(`${API}/auth/logout/`, () => HttpResponse.json({ detail: "Logged out successfully." })),
  // No refresh cookie: this browser isn't signed in (signIn() in render.tsx changes that).
  http.post(`${API}/auth/refresh/`, () =>
    HttpResponse.json({ detail: "You are not signed in.", code: "session_ended" }, { status: 401 })
  ),
  http.get(`${API}/categories/`, () => HttpResponse.json(categories)),
  http.get(`${API}/transactions/`, () => HttpResponse.json(emptyPage)),
  http.get(`${API}/analytics/dashboard/`, () => HttpResponse.json(dashboard)),
  http.get(`${API}/analytics/monthly/`, () => HttpResponse.json(monthly)),
  http.get(`${API}/analytics/categories/`, () => HttpResponse.json(categoryBreakdown)),
  http.get(`${API}/analytics/insights/`, () => HttpResponse.json(insights)),
  http.get(`${API}/analytics/trends/`, () => HttpResponse.json(trends)),
  http.get(`${API}/analytics/comparison/`, () => HttpResponse.json(comparison)),
  http.get(`${API}/analytics/merchants/`, () => HttpResponse.json(merchants)),
  http.get(`${API}/analytics/spending-patterns/`, () => HttpResponse.json(spendingPatterns)),
  http.get(`${API}/savings-goals/summary/`, () => HttpResponse.json(savingsSummary)),
  // No goals by default, so the dashboard's savings card never matches another test's amounts.
  http.get(`${API}/savings-goals/`, () => HttpResponse.json([])),
  http.get(`${API}/achievements/`, () => HttpResponse.json([])),
  http.post(`${API}/achievements/mark-seen/`, () => HttpResponse.json({ marked: 0 })),
  // Nothing changes on other devices unless a test says so.
  http.get(`${API}/sync/status/`, () => HttpResponse.json(makeSyncStatus())),
];

export const server = setupServer(...defaultHandlers);
