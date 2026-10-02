import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { dashboard } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";

describe("Settings page — base currency", () => {
  beforeEach(() => signIn());

  it("changes the base currency only after confirmation, then shows totals in it", async () => {
    const patches: unknown[] = [];
    server.use(
      http.patch(`${API}/auth/me/`, async ({ request }) => {
        const body = await request.json();
        patches.push(body);
        return HttpResponse.json({
          id: 1,
          email: "anna@example.com",
          first_name: "Anna",
          last_name: "Kovács",
          date_joined: "2026-09-01T10:00:00Z",
          base_currency: "HUF",
        });
      }),
      http.get(`${API}/analytics/dashboard/`, () =>
        HttpResponse.json({ ...dashboard, total_income: "1170000.00", budget_usage: [] })
      )
    );
    const { user } = renderApp("/settings");

    const select = await screen.findByLabelText("Base currency");
    expect(select).toHaveValue("EUR");
    const change = screen.getByRole("button", { name: "Change base currency" });
    expect(change).toBeDisabled();

    await user.selectOptions(select, "HUF");
    await user.click(change);
    const confirm = await screen.findByRole("dialog");
    expect(within(confirm).getByText(/original amounts of your transactions don't change/)).toBeInTheDocument();
    expect(patches).toHaveLength(0);

    await user.click(within(confirm).getByRole("button", { name: "Switch currency" }));

    await waitFor(() => expect(patches).toEqual([{ base_currency: "HUF" }]));
    expect(await screen.findByText(/Your base currency is now HUF\./)).toHaveAttribute("role", "status");

    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    // 1,170,000 forints: formatted in HUF, without decimals.
    const income = await screen.findByText(/1[\s.,]?170[\s.,]?000/);
    expect(income).toHaveTextContent(/HUF|Ft/);
    expect(income).not.toHaveTextContent(/000[.,]\d/);
  });

  it("shows why the change was refused and keeps the old currency", async () => {
    server.use(
      http.patch(`${API}/auth/me/`, () =>
        HttpResponse.json({ base_currency: ["No USD exchange rate is available for 2019-03-04."] }, { status: 400 })
      )
    );
    const { user } = renderApp("/settings");

    await user.selectOptions(await screen.findByLabelText("Base currency"), "USD");
    await user.click(screen.getByRole("button", { name: "Change base currency" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Switch currency" }));

    expect(await screen.findByText("No USD exchange rate is available for 2019-03-04.")).toBeInTheDocument();
    expect(screen.queryByText(/Your base currency is now/)).not.toBeInTheDocument();
  });
});

describe("Settings page — appearance", () => {
  beforeEach(() => signIn());

  it("switches between System, Light and Dark and remembers the choice", async () => {
    const { user } = renderApp("/settings");

    const theme = await screen.findByRole("radiogroup", { name: "Theme" });
    expect(within(theme).getByRole("radio", { name: "System" })).toBeChecked();
    expect(document.documentElement).not.toHaveAttribute("data-theme");

    await user.click(within(theme).getByRole("radio", { name: "Dark" }));
    expect(within(theme).getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("wallex-theme")).toBe("dark");

    await user.click(within(theme).getByRole("radio", { name: "System" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });
});
