import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { dashboard } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";

function card(title: string) {
  return screen.getByRole("heading", { name: title }).closest("section")!;
}

describe("Dashboard page", () => {
  beforeEach(() => signIn());

  it("shows the backend's figures as-is — the client does no financial math", async () => {
    // Deliberately inconsistent numbers: if the client recomputed the balance
    // (3000.00 - 1234.56 = 1765.44) the test would see that instead.
    server.use(
      http.get(`${API}/analytics/dashboard/`, () =>
        HttpResponse.json({ ...dashboard, balance: "42.00" })
      )
    );
    renderApp("/dashboard");

    expect(await screen.findByText(/3[\s.,]?000[.,]00/)).toBeInTheDocument();
    expect(screen.getByText(/1[\s.,]?234[.,]56/)).toBeInTheDocument();
    expect(screen.getByText(/42[.,]00/)).toBeInTheDocument();
    expect(screen.queryByText(/1[\s.,]?765[.,]44/)).not.toBeInTheDocument();
  });

  it("requests the selected month", async () => {
    const requested: string[] = [];
    server.use(
      http.get(`${API}/analytics/dashboard/`, ({ request }) => {
        const url = new URL(request.url);
        requested.push(`${url.searchParams.get("year")}-${url.searchParams.get("month")}`);
        return HttpResponse.json(dashboard);
      })
    );
    const { user } = renderApp("/dashboard");
    await screen.findByText(/1[\s.,]?234[.,]56/);

    await user.click(screen.getByRole("button", { name: /previous month/i }));

    await screen.findAllByText(/1[\s.,]?234[.,]56/);
    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    expect(requested).toContain(`${previous.getFullYear()}-${previous.getMonth() + 1}`);
  });

  it("renders insights from the API", async () => {
    renderApp("/dashboard");

    await screen.findByText("Food exceeded its budget by 14%.");
    expect(within(card("Insights")).getByText(/100[.,]00.*over budget/)).toBeInTheDocument();
  });

  it("a failing section shows its own error and retry; the rest keeps working", async () => {
    server.use(
      http.get(`${API}/analytics/insights/`, () => HttpResponse.json({ detail: "boom" }, { status: 500 }))
    );
    const { user } = renderApp("/dashboard");

    await screen.findByText(/1[\s.,]?234[.,]56/); // overview still rendered
    const insights = card("Insights");
    const retry = await within(insights).findByRole("button", { name: /retry/i });

    server.resetHandlers(); // backend recovers
    await user.click(retry);

    expect(await within(insights).findByText("Food exceeded its budget by 14%.")).toBeInTheDocument();
  });

  it("empty month: sections show empty states instead of crashing", async () => {
    server.use(
      http.get(`${API}/analytics/dashboard/`, () =>
        HttpResponse.json({
          ...dashboard,
          total_income: "0.00",
          total_expenses: "0.00",
          balance: "0.00",
          transaction_count: 0,
          top_spending_category: null,
          budget_usage: [],
        })
      ),
      http.get(`${API}/analytics/insights/`, () => HttpResponse.json({ year: 2026, month: 9, insights: [] })),
      http.get(`${API}/analytics/categories/`, () => HttpResponse.json({ year: 2026, month: 9, categories: [] }))
    );
    renderApp("/dashboard");

    expect(await screen.findByText(/No insights for this month yet/)).toBeInTheDocument();
    expect(screen.getAllByText(/No expenses recorded this month yet/).length).toBeGreaterThan(0);
  });
});
