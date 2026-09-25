import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { categories, dashboard, emptyPage, insights, monthly, categoryBreakdown, user } from "./fixtures";

export const API = "http://localhost:8000/api";

/**
 * A fake backend at the network level: the real axios client, interceptors
 * and token-refresh logic all run exactly as in the browser. Tests override
 * individual endpoints with `server.use(...)`.
 */
export const defaultHandlers = [
  http.get(`${API}/auth/me/`, () => HttpResponse.json(user)),
  http.post(`${API}/auth/logout/`, () => HttpResponse.json({ detail: "Logged out successfully." })),
  http.get(`${API}/categories/`, () => HttpResponse.json(categories)),
  http.get(`${API}/transactions/`, () => HttpResponse.json(emptyPage)),
  http.get(`${API}/analytics/dashboard/`, () => HttpResponse.json(dashboard)),
  http.get(`${API}/analytics/monthly/`, () => HttpResponse.json(monthly)),
  http.get(`${API}/analytics/categories/`, () => HttpResponse.json(categoryBreakdown)),
  http.get(`${API}/analytics/insights/`, () => HttpResponse.json(insights)),
];

export const server = setupServer(...defaultHandlers);
