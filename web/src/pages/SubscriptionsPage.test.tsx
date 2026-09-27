import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { makeSubscription, subscriptionSummary } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";
import type { Subscription, SubscriptionSummary } from "../types/subscription";

/** Number inputs: jsdom sanitizes intermediate values while typing — paste at once. */
async function enterAmount(user: ReturnType<typeof import("@testing-library/user-event").default.setup>, input: HTMLElement, value: string) {
  await user.clear(input);
  await user.click(input);
  await user.paste(value);
}

/** A tiny in-memory /subscriptions/ backend, so writes are visible on the refetch that follows. */
function fakeSubscriptionsBackend(initial: Subscription[], summary: SubscriptionSummary = subscriptionSummary) {
  let rows = [...initial];
  const requests: { method: string; body?: unknown; id?: string }[] = [];
  let summaryCalls = 0;
  server.use(
    http.get(`${API}/subscriptions/summary/`, () => {
      summaryCalls += 1;
      return HttpResponse.json(summary);
    }),
    http.get(`${API}/subscriptions/`, () => HttpResponse.json(rows)),
    http.get(`${API}/subscriptions/:id/`, ({ params }) => {
      const row = rows.find((item) => String(item.id) === params.id);
      return row
        ? HttpResponse.json(row)
        : HttpResponse.json({ detail: "No Subscription matches the given query." }, { status: 404 });
    }),
    http.post(`${API}/subscriptions/`, async ({ request }) => {
      const body = (await request.json()) as Partial<Subscription>;
      requests.push({ method: "POST", body });
      const created = makeSubscription({ ...body, id: 999 });
      rows = [...rows, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API}/subscriptions/:id/`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<Subscription>;
      requests.push({ method: "PATCH", body, id: String(params.id) });
      rows = rows.map((row) => (String(row.id) === params.id ? { ...row, ...body } : row));
      return HttpResponse.json(rows.find((row) => String(row.id) === params.id));
    }),
    http.delete(`${API}/subscriptions/:id/`, ({ params }) => {
      requests.push({ method: "DELETE", id: String(params.id) });
      rows = rows.filter((row) => String(row.id) !== params.id);
      return new HttpResponse(null, { status: 204 });
    })
  );
  return { requests, summaryCalls: () => summaryCalls };
}

/** The subscription's row in the table (its name also appears in the upcoming-payments card). */
async function findRow(name: string) {
  const table = await screen.findByRole("table");
  return (await within(table).findByRole("link", { name })).closest("tr")!;
}

function statValue(label: string) {
  return screen.getByText(label).parentElement!;
}

describe("Subscriptions page", () => {
  beforeEach(() => signIn());

  it("lists subscriptions and shows the API's totals as-is", async () => {
    // Deliberately inconsistent: 17.99 × 12 would be 215.88 — the page must show the API's figures.
    fakeSubscriptionsBackend([makeSubscription({ id: 1, name: "Netflix" })], {
      ...subscriptionSummary,
      monthly_total: "95.96",
      yearly_total: "1151.52",
    });
    renderApp("/subscriptions");

    const row = await findRow("Netflix");
    expect(within(row).getByText("Food")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    await waitFor(() => expect(statValue("Monthly subscriptions")).toHaveTextContent(/95[.,]96/));
    expect(statValue("Yearly projection")).toHaveTextContent(/1[\s.,]?151[.,]52/);
    expect(statValue("Active subscriptions")).toHaveTextContent("5 · 1 paused");
  });

  it("shows a foreign-currency subscription as billed, with its monthly cost in the base currency", async () => {
    fakeSubscriptionsBackend([
      makeSubscription({ id: 2, name: "Adobe", amount: "59.99", currency: "USD", base_monthly_cost: "51.27" }),
    ]);
    renderApp("/subscriptions");

    const row = await findRow("Adobe");
    expect(within(row).getByText(/59[.,]99/)).toHaveTextContent(/\$|USD/);
    expect(within(row).getByText(/≈.*51[.,]27/)).toHaveTextContent(/€|EUR/);
  });

  it("says which currencies are missing from the totals", async () => {
    fakeSubscriptionsBackend([], { ...subscriptionSummary, unconverted_currencies: ["USD"] });
    renderApp("/subscriptions");

    expect(await screen.findByText(/Not included in the totals: subscriptions billed in USD/)).toBeInTheDocument();
  });

  it("adds a subscription with the payload the API expects and reloads the totals", async () => {
    const backend = fakeSubscriptionsBackend([]);
    const { user } = renderApp("/subscriptions");

    await user.click(await screen.findByRole("button", { name: "Add subscription" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Spotify");
    await enterAmount(user, within(dialog).getByLabelText("Price per payment"), "10.99");
    await user.selectOptions(within(dialog).getByLabelText("Currency"), "USD");
    await user.selectOptions(within(dialog).getByLabelText("Billing"), "yearly");
    await user.selectOptions(within(dialog).getByLabelText("Category"), "Transport");
    await user.clear(within(dialog).getByLabelText("First payment"));
    await user.type(within(dialog).getByLabelText("First payment"), "2026-10-14");
    await user.click(within(dialog).getByRole("button", { name: "Add subscription" }));

    await waitFor(() => expect(backend.requests).toHaveLength(1));
    expect(backend.requests[0]).toEqual({
      method: "POST",
      body: {
        name: "Spotify",
        merchant: "",
        amount: expect.stringMatching(/^10\.99$/),
        currency: "USD",
        category: 11,
        frequency: "yearly",
        start_date: "2026-10-14",
        end_date: null,
        description: "",
        active: true,
      },
    });
    expect(await findRow("Spotify")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(backend.summaryCalls()).toBe(2)); // totals reloaded after the write
  });

  it("offers only expense categories and validates before sending", async () => {
    const backend = fakeSubscriptionsBackend([]);
    const { user } = renderApp("/subscriptions");

    await user.click(await screen.findByRole("button", { name: "Add subscription" }));
    const dialog = await screen.findByRole("dialog");
    const categoryOptions = within(within(dialog).getByLabelText("Category")).getAllByRole("option");
    expect(categoryOptions.map((option) => option.textContent)).toEqual(["Select a category", "Food", "Transport"]);

    await enterAmount(user, within(dialog).getByLabelText("Price per payment"), "4990.5");
    await user.selectOptions(within(dialog).getByLabelText("Currency"), "HUF");
    await user.click(within(dialog).getByRole("button", { name: "Add subscription" }));

    expect(await within(dialog).findByText("Name is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("HUF amounts can't have decimals.")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose a category.")).toBeInTheDocument();
    expect(backend.requests).toHaveLength(0);
  });

  it("shows the backend's validation error next to the field", async () => {
    fakeSubscriptionsBackend([makeSubscription({ id: 5, name: "Gym" })]);
    server.use(
      http.patch(`${API}/subscriptions/:id/`, () =>
        HttpResponse.json({ end_date: ["End date must be on or after the start date."] }, { status: 400 })
      )
    );
    const { user } = renderApp("/subscriptions");

    await user.click(await screen.findByRole("button", { name: "Edit Gym" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await within(dialog).findAllByText("End date must be on or after the start date.")).not.toHaveLength(0);
  });

  it("edits a subscription with PATCH", async () => {
    const backend = fakeSubscriptionsBackend([makeSubscription({ id: 7, name: "Netflix" })]);
    const { user } = renderApp("/subscriptions");

    await user.click(await screen.findByRole("button", { name: "Edit Netflix" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Netflix");
    await enterAmount(user, within(dialog).getByLabelText("Price per payment"), "19.99");
    await user.click(within(dialog).getByLabelText(/Active/));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(backend.requests).toHaveLength(1));
    expect(backend.requests[0]).toMatchObject({
      method: "PATCH",
      id: "7",
      body: { amount: "19.99", active: false, name: "Netflix" },
    });
  });

  it("deletes a subscription after confirmation", async () => {
    const backend = fakeSubscriptionsBackend([makeSubscription({ id: 8, name: "Disney+" })]);
    const { user } = renderApp("/subscriptions");

    await user.click(await screen.findByRole("button", { name: "Delete Disney+" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(backend.requests).toEqual([{ method: "DELETE", id: "8" }]));
    expect(await screen.findByText(/No subscriptions yet/)).toBeInTheDocument();
  });

  it("lists the next 30 days' payments from the summary", async () => {
    fakeSubscriptionsBackend([makeSubscription()]);
    renderApp("/subscriptions");

    const card = (await screen.findByRole("heading", { name: "Next 30 days" })).closest("section")!;
    expect(within(card).getByRole("link", { name: "Netflix" })).toHaveAttribute("href", "/subscriptions/300");
  });
});

describe("Subscription details page", () => {
  beforeEach(() => signIn());

  it("shows the subscription with the costs and schedule the API computed", async () => {
    fakeSubscriptionsBackend([
      makeSubscription({
        id: 42,
        name: "Adobe",
        merchant: "Adobe Systems",
        amount: "59.99",
        currency: "USD",
        monthly_cost: "59.99",
        yearly_cost: "719.88",
        base_monthly_cost: "51.27",
        base_yearly_cost: "615.28",
        description: "Creative Cloud",
        upcoming_payments: ["2026-10-14", "2026-11-14"],
      }),
    ]);
    renderApp("/subscriptions/42");

    expect(await screen.findByRole("heading", { name: /Adobe/ })).toHaveTextContent("Active");
    expect(screen.getByText("Adobe Systems")).toBeInTheDocument();
    expect(statValue("Yearly cost")).toHaveTextContent(/719[.,]88.*≈.*615[.,]28/);
    expect(screen.getByText("Creative Cloud")).toBeInTheDocument();
    const schedule = screen.getByRole("heading", { name: "Upcoming payments" }).closest("section")!;
    expect(within(schedule).getAllByRole("listitem")).toHaveLength(2);
  });

  it("deletes and goes back to the list", async () => {
    const backend = fakeSubscriptionsBackend([makeSubscription({ id: 42, name: "Adobe" })]);
    const { user } = renderApp("/subscriptions/42");

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(backend.requests).toEqual([{ method: "DELETE", id: "42" }]));
    expect(await screen.findByRole("heading", { name: "Subscriptions" })).toBeInTheDocument();
  });

  it("reports an unknown subscription", async () => {
    fakeSubscriptionsBackend([]);
    renderApp("/subscriptions/12345");

    expect(await screen.findByRole("alert")).toHaveTextContent("No Subscription matches the given query.");
  });
});
