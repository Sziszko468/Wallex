import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { comparison, dashboard, trends, user as signedInUser } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";

function card(title: string) {
  return screen.getByRole("heading", { name: title }).closest("section")!;
}

/** The card once its data has loaded (its skeleton replaced by content). */
async function waitForCard(title: string) {
  await screen.findByRole("heading", { name: title });
  await waitFor(() => expect(card(title).querySelector("[class*='skeleton']")).toBeNull());
  return card(title);
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

  it("shows totals in the user's base currency", async () => {
    server.use(
      http.get(`${API}/auth/me/`, () =>
        HttpResponse.json({ ...signedInUser, base_currency: "HUF" })
      ),
      http.get(`${API}/analytics/dashboard/`, () =>
        HttpResponse.json({ ...dashboard, total_income: "1170000.00", budget_usage: [] })
      )
    );
    renderApp("/dashboard");

    const income = await screen.findByText(/1[\s.,]?170[\s.,]?000/);
    expect(income).toHaveTextContent(/HUF|Ft/);
    expect(income).not.toHaveTextContent(/€|EUR/);
  });

  it("shows the spending analysis exactly as the API computed it", async () => {
    // A deliberately "wrong" average: the client must show it, not recompute (1920 + 2100) / 2.
    server.use(
      http.get(`${API}/analytics/trends/`, () => HttpResponse.json({ ...trends, average_monthly_expenses: "999.00" }))
    );
    renderApp("/dashboard");

    const trend = await waitForCard("Spending trend");
    expect(within(trend).getByText(/999[.,]00/)).toBeInTheDocument();
    expect(within(trend).getByText(/2[\s.,]?100[.,]00/)).toBeInTheDocument();

    const categoryRow = within(await waitForCard("Category trends")).getByRole("row", { name: /Food/ });
    expect(within(categoryRow).getByText(/280[.,]00/)).toBeInTheDocument();
    expect(within(categoryRow).getByText(/320[.,]00/)).toBeInTheDocument();
    expect(within(categoryRow).getByText("+14.3%")).toBeInTheDocument();

    const merchantsCard = await waitForCard("Top merchants");
    expect(within(merchantsCard).getByText("Albert Heijn")).toBeInTheDocument();
    expect(within(merchantsCard).getByText(/420[.,]00/)).toBeInTheDocument();
    expect(within(merchantsCard).getByText("new")).toBeInTheDocument(); // Jumbo: nothing spent there last month

    const patternsCard = await waitForCard("Spending patterns");
    expect(within(patternsCard).getByText(/70[.,]00/)).toBeInTheDocument();
    expect(within(patternsCard).getByText("28.6% of spending")).toBeInTheDocument();

    const budgets = card("Budget overview");
    expect(within(budgets).getByText("Over budget")).toBeInTheDocument();
    expect(within(budgets).getByText(/14\.3% over budget/)).toBeInTheDocument();
  });

  it("switches the comparison to year-over-year", async () => {
    const requested: (string | null)[] = [];
    server.use(
      http.get(`${API}/analytics/comparison/`, ({ request }) => {
        const against = new URL(request.url).searchParams.get("against");
        requested.push(against);
        return HttpResponse.json(
          against === "previous_year"
            ? { ...comparison, against, previous_month: { ...comparison.previous_month, year: 2025, month: 9 } }
            : comparison
        );
      })
    );
    const { user } = renderApp("/dashboard");

    const comparisonCard = await waitForCard("Comparison");
    expect(within(comparisonCard).getByRole("button", { name: "vs last month" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(comparisonCard).getByRole("button", { name: "vs last year" }));

    await waitFor(() => expect(requested).toContain("previous_year"));
    expect(await within(card("Comparison")).findByText(/2025/)).toBeInTheDocument();
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
