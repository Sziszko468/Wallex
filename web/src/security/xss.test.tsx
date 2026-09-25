import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { dashboard, insights, makeTransaction, page } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";

const PAYLOAD = '<img src=x onerror="window.__xss = true">';

describe("stored XSS", () => {
  it("user-controlled text from the API is shown as text, never parsed as HTML", async () => {
    signIn();
    server.use(
      http.get(`${API}/transactions/`, () => HttpResponse.json(page([makeTransaction({ description: PAYLOAD })]))),
      http.get(`${API}/analytics/dashboard/`, () =>
        HttpResponse.json({ ...dashboard, top_spending_category: { category_id: 10, category_name: PAYLOAD, amount: "1.00" } })
      ),
      http.get(`${API}/analytics/insights/`, () =>
        HttpResponse.json({ ...insights, insights: [{ ...insights.insights[0]!, message: PAYLOAD }] })
      )
    );

    const { unmount } = renderApp("/transactions");
    expect((await screen.findAllByText(PAYLOAD)).length).toBeGreaterThan(0);
    expect(document.querySelector("img[src='x']")).toBeNull();
    unmount();

    renderApp("/dashboard");
    expect((await screen.findAllByText(PAYLOAD)).length).toBeGreaterThan(0);
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect((window as { __xss?: boolean }).__xss).toBeUndefined();
  });
});
