import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { conversionPreview, makeTransaction, page } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";
import type { Transaction } from "../types/transaction";

/** Number inputs: jsdom sanitizes the intermediate "15." while typing, a real browser doesn't — paste at once. */
async function enterAmount(user: ReturnType<typeof import("@testing-library/user-event").default.setup>, input: HTMLElement, value: string) {
  await user.clear(input);
  await user.click(input);
  await user.paste(value);
}

/** A tiny in-memory backend for /transactions/ so create/edit/delete are visible on refetch. */
function fakeTransactionsBackend(initial: Transaction[]) {
  let rows = [...initial];
  const requests: { method: string; body?: unknown; id?: string }[] = [];
  server.use(
    http.get(`${API}/transactions/`, () => HttpResponse.json(page(rows))),
    http.post(`${API}/transactions/`, async ({ request }) => {
      const body = (await request.json()) as Partial<Transaction>;
      requests.push({ method: "POST", body });
      const created = makeTransaction({ ...body, id: 999, description: body.description ?? "" });
      rows = [created, ...rows];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API}/transactions/:id/`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<Transaction>;
      requests.push({ method: "PATCH", body, id: String(params.id) });
      rows = rows.map((row) => (String(row.id) === params.id ? { ...row, ...body } : row));
      return HttpResponse.json(rows.find((row) => String(row.id) === params.id));
    }),
    http.delete(`${API}/transactions/:id/`, ({ params }) => {
      requests.push({ method: "DELETE", id: String(params.id) });
      rows = rows.filter((row) => String(row.id) !== params.id);
      return new HttpResponse(null, { status: 204 });
    })
  );
  return requests;
}

describe("Transactions page", () => {
  beforeEach(() => signIn());

  it("lists the user's transactions from the API", async () => {
    fakeTransactionsBackend([makeTransaction({ id: 1, description: "Groceries", amount: "12.50" })]);
    renderApp("/transactions");

    const row = (await screen.findByText("Groceries")).closest("tr")!;
    expect(within(row).getByText("Food")).toBeInTheDocument();
    expect(within(row).getByText(/12[.,]50/)).toBeInTheDocument();
  });

  it("creates a transaction with the exact payload the API expects", async () => {
    const requests = fakeTransactionsBackend([]);
    const { user } = renderApp("/transactions");

    await user.click(await screen.findByRole("button", { name: "Add transaction" }));
    const dialog = await screen.findByRole("dialog");
    await enterAmount(user, within(dialog).getByLabelText("Amount"), "42.10");
    await user.selectOptions(within(dialog).getByLabelText("Category"), "Transport");
    await user.type(within(dialog).getByLabelText("Description (optional)"), "Taxi");
    await user.clear(within(dialog).getByLabelText("Date"));
    await user.type(within(dialog).getByLabelText("Date"), "2026-09-21");
    await user.click(within(dialog).getByRole("button", { name: "Add transaction" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    // Money stays a string (never a float); category is the numeric id. (jsdom normalizes a
    // number input's "42.10" to "42.1" — a browser keeps the trailing zero; both are exact.)
    expect(requests[0]).toEqual({
      method: "POST",
      body: {
        amount: expect.stringMatching(/^42\.10?$/),
        currency: "EUR", // the user's base currency, preselected
        type: "expense",
        category: 11,
        description: "Taxi",
        date: "2026-09-21",
      },
    });
    expect(await screen.findByText("Taxi")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not send invalid data", async () => {
    const requests = fakeTransactionsBackend([]);
    const { user } = renderApp("/transactions");

    await user.click(await screen.findByRole("button", { name: "Add transaction" }));
    const dialog = await screen.findByRole("dialog");
    await enterAmount(user, within(dialog).getByLabelText("Amount"), "0");
    await user.click(within(dialog).getByRole("button", { name: "Add transaction" }));

    expect(await within(dialog).findByText("Amount must be greater than 0.")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose a category.")).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("shows the backend's validation error next to the field", async () => {
    fakeTransactionsBackend([]);
    server.use(
      http.post(`${API}/transactions/`, () =>
        HttpResponse.json({ amount: ["Ensure that there are no more than 2 decimal places."] }, { status: 400 })
      )
    );
    const { user } = renderApp("/transactions");

    await user.click(await screen.findByRole("button", { name: "Add transaction" }));
    const dialog = await screen.findByRole("dialog");
    await enterAmount(user, within(dialog).getByLabelText("Amount"), "1.005");
    await user.selectOptions(within(dialog).getByLabelText("Category"), "Food");
    await user.click(within(dialog).getByRole("button", { name: "Add transaction" }));

    expect(
      await within(dialog).findAllByText("Ensure that there are no more than 2 decimal places.")
    ).not.toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // stays open, input kept
  });

  it("edits a transaction with PATCH", async () => {
    const requests = fakeTransactionsBackend([makeTransaction({ id: 7, description: "Groceries", amount: "12.50" })]);
    const { user } = renderApp("/transactions");

    await user.click(await screen.findByRole("button", { name: "Edit Groceries" }));
    const dialog = await screen.findByRole("dialog");
    await enterAmount(user, within(dialog).getByLabelText("Amount"), "15.00");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ method: "PATCH", id: "7", body: { amount: expect.stringMatching(/^15(\.00)?$/) } });
    expect(await screen.findByText(/15[.,]00/)).toBeInTheDocument();
  });

  it("shows a foreign-currency transaction as paid, with its value in the base currency", async () => {
    fakeTransactionsBackend([
      makeTransaction({ id: 3, description: "Lunch in Budapest", amount: "15000.00", currency: "HUF", base_amount: "38.48" }),
    ]);
    renderApp("/transactions");

    const row = (await screen.findByText("Lunch in Budapest")).closest("tr")!;
    const paid = within(row).getByText(/15[\s.,]?000/);
    expect(paid).toHaveTextContent(/HUF|Ft/);
    expect(paid).not.toHaveTextContent(/000[.,]\d/); // whole forints
    expect(within(row).getByText(/≈ .*38[.,]48/)).toHaveTextContent(/€|EUR/);
  });

  it("creates a transaction in another currency after previewing the conversion", async () => {
    const requests = fakeTransactionsBackend([]);
    const previewRequests: URLSearchParams[] = [];
    server.use(
      http.get(`${API}/currencies/convert/`, ({ request }) => {
        previewRequests.push(new URL(request.url).searchParams);
        return HttpResponse.json(conversionPreview);
      })
    );
    const { user } = renderApp("/transactions");

    await user.click(await screen.findByRole("button", { name: "Add transaction" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Currency"), "HUF");
    await enterAmount(user, within(dialog).getByLabelText("Amount"), "15000");
    await user.selectOptions(within(dialog).getByLabelText("Category"), "Food");

    // The backend converts; the form only shows the result.
    expect(await within(dialog).findByText(/≈ .*38[.,]48/)).toHaveTextContent(/€|EUR/);
    expect(within(dialog).getByText(/ECB rate of/)).toBeInTheDocument();
    expect(previewRequests.at(-1)?.get("currency")).toBe("HUF");
    expect(previewRequests.at(-1)?.get("amount")).toBe("15000");

    await user.click(within(dialog).getByRole("button", { name: "Add transaction" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toMatchObject({ amount: "15000", currency: "HUF", category: 10 });
  });

  it("explains a missing exchange rate instead of a converted value", async () => {
    fakeTransactionsBackend([]);
    server.use(
      http.get(`${API}/currencies/convert/`, () =>
        HttpResponse.json({ exchange_rate: ["No USD exchange rate is available for 2026-09-26."] }, { status: 400 })
      )
    );
    const { user } = renderApp("/transactions");

    await user.click(await screen.findByRole("button", { name: "Add transaction" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Currency"), "USD");
    await enterAmount(user, within(dialog).getByLabelText("Amount"), "20");

    expect(await within(dialog).findByText("No USD exchange rate is available for 2026-09-26.")).toBeInTheDocument();
  });

  it("does not send fractional forints", async () => {
    const requests = fakeTransactionsBackend([]);
    const { user } = renderApp("/transactions");

    await user.click(await screen.findByRole("button", { name: "Add transaction" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Currency"), "HUF");
    await enterAmount(user, within(dialog).getByLabelText("Amount"), "1500.5");
    await user.selectOptions(within(dialog).getByLabelText("Category"), "Food");
    await user.click(within(dialog).getByRole("button", { name: "Add transaction" }));

    expect(await within(dialog).findByText("HUF amounts can't have decimals.")).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("sorts amounts by their value in the base currency", async () => {
    const orderings: (string | null)[] = [];
    fakeTransactionsBackend([makeTransaction({ id: 1, description: "Groceries" })]);
    server.use(
      http.get(`${API}/transactions/`, ({ request }) => {
        orderings.push(new URL(request.url).searchParams.get("ordering"));
        return HttpResponse.json(page([makeTransaction({ id: 1, description: "Groceries" })]));
      })
    );
    const { user } = renderApp("/transactions");

    await user.click(await screen.findByRole("button", { name: /^Amount/ }));

    await waitFor(() => expect(orderings).toContain("base_amount"));
  });

  it("deletes only after confirmation", async () => {
    const requests = fakeTransactionsBackend([makeTransaction({ id: 7, description: "Groceries" })]);
    const { user } = renderApp("/transactions");

    await user.click(await screen.findByRole("button", { name: "Delete Groceries" }));
    const confirm = await screen.findByRole("dialog");
    expect(within(confirm).getByText(/can't be undone/)).toBeInTheDocument();
    expect(requests).toHaveLength(0);

    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(requests).toEqual([{ method: "DELETE", id: "7" }]));
    await waitFor(() => expect(screen.queryByText("Groceries")).not.toBeInTheDocument());
  });
});
