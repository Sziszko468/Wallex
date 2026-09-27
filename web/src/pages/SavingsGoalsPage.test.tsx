import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { makeSavingsGoal, savingsSummary } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";
import type { SavingsGoal, SavingsSummary } from "../types/savingsGoal";

type User = ReturnType<typeof import("@testing-library/user-event").default.setup>;

/** Number inputs: jsdom sanitizes intermediate values while typing — paste at once. */
async function enterAmount(user: User, input: HTMLElement, value: string) {
  await user.clear(input);
  await user.click(input);
  await user.paste(value);
}

/**
 * A tiny in-memory /savings-goals/ backend. Deposits and withdrawals answer with whatever
 * `afterMove` returns, standing in for the server's own calculation.
 */
function fakeGoalsBackend(
  initial: SavingsGoal[],
  { summary = savingsSummary, afterMove }: { summary?: SavingsSummary; afterMove?: (goal: SavingsGoal) => SavingsGoal } = {}
) {
  let rows = [...initial];
  const requests: { method: string; path: string; body?: unknown }[] = [];
  server.use(
    http.get(`${API}/savings-goals/summary/`, () => HttpResponse.json(summary)),
    http.get(`${API}/savings-goals/`, () => HttpResponse.json(rows)),
    http.get(`${API}/savings-goals/:id/`, ({ params }) => {
      const row = rows.find((goal) => String(goal.id) === params.id);
      return row ? HttpResponse.json(row) : HttpResponse.json({ detail: "No SavingsGoal matches the given query." }, { status: 404 });
    }),
    http.post(`${API}/savings-goals/`, async ({ request }) => {
      const body = (await request.json()) as Partial<SavingsGoal>;
      requests.push({ method: "POST", path: "/savings-goals/", body });
      const created = makeSavingsGoal({ ...body, id: 99 });
      rows = [...rows, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API}/savings-goals/:id/`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<SavingsGoal>;
      requests.push({ method: "PATCH", path: `/savings-goals/${params.id}/`, body });
      rows = rows.map((goal) => (String(goal.id) === params.id ? { ...goal, ...body } : goal));
      return HttpResponse.json(rows.find((goal) => String(goal.id) === params.id));
    }),
    http.post(`${API}/savings-goals/:id/:action/`, async ({ request, params }) => {
      const body = await request.json();
      requests.push({ method: "POST", path: `/savings-goals/${params.id}/${params.action}/`, body });
      rows = rows.map((goal) => (String(goal.id) === params.id && afterMove ? afterMove(goal) : goal));
      return HttpResponse.json(rows.find((goal) => String(goal.id) === params.id));
    }),
    http.delete(`${API}/savings-goals/:id/`, ({ params }) => {
      requests.push({ method: "DELETE", path: `/savings-goals/${params.id}/` });
      rows = rows.filter((goal) => String(goal.id) !== params.id);
      return new HttpResponse(null, { status: 204 });
    })
  );
  return requests;
}

function stat(label: string) {
  return screen.getByText(label).parentElement!;
}

describe("Savings goals page", () => {
  beforeEach(() => signIn());

  it("shows each goal's progress and target date as the API computed them", async () => {
    fakeGoalsBackend([makeSavingsGoal()]);
    renderApp("/goals");

    const card = await screen.findByRole("article", { name: "Japan trip" });
    expect(within(card).getByText(/1[\s.,]?850[.,]00/)).toBeInTheDocument();
    expect(within(card).getByText(/3[\s.,]?000[.,]00/)).toBeInTheDocument();
    expect(within(card).getByText("61.7%")).toBeInTheDocument();
    expect(within(card).getByRole("progressbar", { name: "Japan trip progress" })).toHaveAttribute("aria-valuenow", "62");
    expect(within(card).getByText(/186 days left/)).toBeInTheDocument();
    expect(within(card).getByText("Active")).toBeInTheDocument();
  });

  it("shows the totals from the summary, not client-side sums", async () => {
    // Deliberately inconsistent with the goal list: the page must show the API's figures.
    fakeGoalsBackend([makeSavingsGoal()], {
      summary: { ...savingsSummary, total_saved: "4350.00", total_target: "6500.00", progress_percentage: 66.92 },
    });
    renderApp("/goals");

    await waitFor(() => expect(stat("Total saved")).toHaveTextContent(/4[\s.,]?350[.,]00/));
    expect(stat("Total target")).toHaveTextContent(/6[\s.,]?500[.,]00/);
    expect(stat("Overall progress")).toHaveTextContent("66.9%");
  });

  it("clamps an over-saved goal's bar but shows the real percentage", async () => {
    fakeGoalsBackend([makeSavingsGoal({ status: "completed", progress_percentage: 110, current_amount: "3300.00" })]);
    renderApp("/goals");

    const card = await screen.findByRole("article", { name: "Japan trip" });
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(within(card).getByText("110.0%")).toBeInTheDocument();
    expect(within(card).getByText("Completed")).toBeInTheDocument();
  });

  it("marks an overdue goal", async () => {
    fakeGoalsBackend([makeSavingsGoal({ days_left: -3, target_date: "2026-09-24" })]);
    renderApp("/goals");

    expect(await screen.findByText(/3 days overdue/)).toBeInTheDocument();
  });

  it("creates a goal with the payload the API expects", async () => {
    const requests = fakeGoalsBackend([]);
    const { user } = renderApp("/goals");

    await user.click(await screen.findByRole("button", { name: "New goal" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Laptop");
    await enterAmount(user, within(dialog).getByLabelText("Target amount"), "650000");
    await user.selectOptions(within(dialog).getByLabelText("Currency"), "HUF");
    await enterAmount(user, within(dialog).getByLabelText("Already saved (optional)"), "50000");
    await user.type(within(dialog).getByLabelText("Target date (optional)"), "2099-03-15");
    await user.click(within(dialog).getByRole("button", { name: "Create goal" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      method: "POST",
      path: "/savings-goals/",
      body: {
        name: "Laptop",
        target_amount: "650000",
        current_amount: "50000",
        currency: "HUF",
        target_date: "2099-03-15",
      },
    });
    expect(await screen.findByRole("article", { name: "Laptop" })).toBeInTheDocument();
  });

  it("validates before sending", async () => {
    const requests = fakeGoalsBackend([]);
    const { user } = renderApp("/goals");

    await user.click(await screen.findByRole("button", { name: "New goal" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Currency"), "JPY");
    await enterAmount(user, within(dialog).getByLabelText("Target amount"), "1500.5");
    await user.type(within(dialog).getByLabelText("Target date (optional)"), "2020-01-01");
    await user.click(within(dialog).getByRole("button", { name: "Create goal" }));

    expect(await within(dialog).findByText("Name is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("JPY amounts can't have decimals.")).toBeInTheDocument();
    expect(within(dialog).getByText("The target date can't be in the past.")).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("edits a goal with PATCH; the currency is locked once money is saved", async () => {
    const requests = fakeGoalsBackend([makeSavingsGoal()]);
    const { user } = renderApp("/goals");

    await user.click(await screen.findByRole("button", { name: "Edit Japan trip" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Currency")).toBeDisabled();
    await enterAmount(user, within(dialog).getByLabelText("Target amount"), "3500.00");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      method: "PATCH",
      path: "/savings-goals/7/",
      body: { name: "Japan trip", target_amount: expect.stringMatching(/^3500(\.00?)?$/), currency: "EUR" },
    });
  });

  it("adds money through the deposit endpoint and shows the server's new figures", async () => {
    const requests = fakeGoalsBackend([makeSavingsGoal()], {
      afterMove: (goal) => ({ ...goal, current_amount: "2050.00", progress_percentage: 68.33 }),
    });
    const { user } = renderApp("/goals");

    await user.click(await screen.findByRole("button", { name: "Add money to Japan trip" }));
    const dialog = await screen.findByRole("dialog", { name: "Add money to Japan trip" });
    await enterAmount(user, within(dialog).getByLabelText("Amount (EUR)"), "200.00");
    await user.click(within(dialog).getByRole("button", { name: "Add money" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      method: "POST",
      path: "/savings-goals/7/deposit/",
      body: { amount: expect.stringMatching(/^200(\.00?)?$/) },
    });
    const card = await screen.findByRole("article", { name: "Japan trip" });
    expect(await within(card).findByText("68.3%")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removes money and shows the server's refusal when it's more than saved", async () => {
    fakeGoalsBackend([makeSavingsGoal({ current_amount: "150.00" })]);
    server.use(
      http.post(`${API}/savings-goals/:id/withdraw/`, () =>
        HttpResponse.json({ amount: ["You can't remove more than the 150.00 EUR saved."] }, { status: 400 })
      )
    );
    const { user } = renderApp("/goals");

    await user.click(await screen.findByRole("button", { name: "Remove money from Japan trip" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove money from Japan trip" });
    await enterAmount(user, within(dialog).getByLabelText("Amount (EUR)"), "500");
    await user.click(within(dialog).getByRole("button", { name: "Remove money" }));

    expect(await within(dialog).findAllByText("You can't remove more than the 150.00 EUR saved.")).not.toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not send an invalid amount", async () => {
    const requests = fakeGoalsBackend([makeSavingsGoal({ currency: "HUF" })]);
    const { user } = renderApp("/goals");

    await user.click(await screen.findByRole("button", { name: "Add money to Japan trip" }));
    const dialog = await screen.findByRole("dialog");
    await enterAmount(user, within(dialog).getByLabelText("Amount (HUF)"), "1500.5");
    await user.click(within(dialog).getByRole("button", { name: "Add money" }));

    expect(await within(dialog).findByText("HUF amounts can't have decimals.")).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("an archived goal takes no money", async () => {
    fakeGoalsBackend([makeSavingsGoal({ status: "archived" })]);
    renderApp("/goals");

    expect(await screen.findByRole("button", { name: "Add money to Japan trip" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove money from Japan trip" })).toBeDisabled();
  });

  it("deletes a goal after confirmation", async () => {
    const requests = fakeGoalsBackend([makeSavingsGoal()]);
    const { user } = renderApp("/goals");

    await user.click(await screen.findByRole("button", { name: "Delete Japan trip" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(requests).toEqual([{ method: "DELETE", path: "/savings-goals/7/" }]));
    expect(await screen.findByText(/No savings goals yet/)).toBeInTheDocument();
  });
});

describe("Savings goal details page", () => {
  beforeEach(() => signIn());

  it("shows progress, amounts in both currencies, and the target date plan", async () => {
    fakeGoalsBackend([
      makeSavingsGoal({
        currency: "USD",
        current_amount: "1250.00",
        target_amount: "5000.00",
        base_current_amount: "1000.00",
        base_target_amount: "4000.00",
        progress_percentage: 25,
        monthly_needed: "625.00",
      }),
    ]);
    renderApp("/goals/7");

    expect(await screen.findByRole("heading", { name: /Japan trip/ })).toHaveTextContent("Active");
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Japan trip progress" })).toHaveAttribute("aria-valuenow", "25");
    expect(stat("Saved")).toHaveTextContent(/1[\s.,]?250[.,]00.*≈.*1[\s.,]?000[.,]00/);
    expect(screen.getByText(/186 days left/)).toBeInTheDocument();
    expect(screen.getByText(/save .*625[.,]00.* a month/)).toBeInTheDocument();
  });

  it("archives and restores with PATCH status", async () => {
    const requests = fakeGoalsBackend([makeSavingsGoal()]);
    const { user } = renderApp("/goals/7");

    await user.click(await screen.findByRole("button", { name: "Archive" }));
    await waitFor(() => expect(requests[0]).toEqual({ method: "PATCH", path: "/savings-goals/7/", body: { status: "archived" } }));
    await user.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(requests[1]).toEqual({ method: "PATCH", path: "/savings-goals/7/", body: { status: "active" } }));
  });

  it("adds money from the details page", async () => {
    const requests = fakeGoalsBackend([makeSavingsGoal()], {
      afterMove: (goal) => ({ ...goal, current_amount: "3000.00", progress_percentage: 100, status: "completed" }),
    });
    const { user } = renderApp("/goals/7");

    await user.click(await screen.findByRole("button", { name: "Add money" }));
    const dialog = await screen.findByRole("dialog");
    await enterAmount(user, within(dialog).getByLabelText("Amount (EUR)"), "1150.00");
    await user.click(within(dialog).getByRole("button", { name: "Add money" }));

    await waitFor(() => expect(requests[0]?.path).toBe("/savings-goals/7/deposit/"));
    expect(await screen.findByRole("heading", { name: /Japan trip/ })).toHaveTextContent("Completed");
  });

  it("deletes and returns to the list", async () => {
    const requests = fakeGoalsBackend([makeSavingsGoal()]);
    const { user } = renderApp("/goals/7");

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(requests).toEqual([{ method: "DELETE", path: "/savings-goals/7/" }]));
    expect(await screen.findByRole("heading", { name: "Savings goals" })).toBeInTheDocument();
  });

  it("reports an unknown goal", async () => {
    fakeGoalsBackend([]);
    renderApp("/goals/12345");

    expect(await screen.findByRole("alert")).toHaveTextContent("No SavingsGoal matches the given query.");
  });
});
