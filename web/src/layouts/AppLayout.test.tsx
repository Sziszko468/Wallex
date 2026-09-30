import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTransaction } from "../test/fixtures";
import { installMatchMedia } from "../test/matchMedia";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";

/** Number inputs: jsdom sanitizes intermediate values while typing — paste at once. */
async function enterAmount(user: ReturnType<typeof import("@testing-library/user-event").default.setup>, input: HTMLElement, value: string) {
  await user.clear(input);
  await user.click(input);
  await user.paste(value);
}

describe("App shell — desktop", () => {
  beforeEach(() => signIn());

  it("has one primary navigation, a main landmark and a skip link", async () => {
    renderApp("/dashboard");

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    expect(screen.getAllByRole("navigation", { name: "Primary" })).toHaveLength(1);
    for (const label of ["Dashboard", "Assistant", "Transactions", "Budgets", "Goals", "Subscriptions", "Recurring", "Categories", "Import", "Achievements"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
  });

  it("marks the page you are on", async () => {
    renderApp("/import");

    expect(await screen.findByRole("link", { name: "Import" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("names every page in the tab title", async () => {
    renderApp("/goals");

    await screen.findByRole("heading", { name: "Savings goals" });
    // The title is set in an effect, which can land a tick after the heading is painted.
    await waitFor(() => expect(document.title).toBe("Goals · Spendly"));
  });

  it("adds a transaction from anywhere with the New transaction button, then confirms it", async () => {
    const requests: unknown[] = [];
    server.use(
      http.post(`${API}/transactions/`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        requests.push(body);
        return HttpResponse.json(makeTransaction({ id: 500, ...body } as never), { status: 201 });
      })
    );
    const { user } = renderApp("/import");

    await user.click(await screen.findByRole("button", { name: "New transaction" }));
    const dialog = await screen.findByRole("dialog", { name: "New transaction" });
    await enterAmount(user, await within(dialog).findByLabelText("Amount"), "9.90");
    await user.selectOptions(within(dialog).getByLabelText("Category"), "Food");
    await user.click(within(dialog).getByRole("button", { name: "Add transaction" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ type: "expense", category: 10, currency: "EUR" });
    expect(await screen.findByRole("status")).toHaveTextContent("Transaction added");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the account menu with the theme switch, and logs out from it", async () => {
    const { user } = renderApp("/dashboard");

    await user.click(await screen.findByRole("button", { name: /Anna Kovács/ }));
    const theme = screen.getByRole("radiogroup", { name: "Theme" });
    expect(within(theme).getByRole("radio", { name: "System" })).toBeChecked();

    await user.click(within(theme).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("closes the account menu with Escape", async () => {
    const { user } = renderApp("/dashboard");
    const trigger = await screen.findByRole("button", { name: /Anna Kovács/ });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});

describe("App shell — phone", () => {
  let media: ReturnType<typeof installMatchMedia>;

  beforeEach(() => {
    signIn();
    media = installMatchMedia({ desktop: false });
  });

  afterEach(() => media.uninstall());

  it("swaps the sidebar for a top bar and a bottom bar with a floating add button", async () => {
    renderApp("/dashboard");

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Dashboard", "Transactions", "Budgets"]);
    expect(within(nav).getByRole("button", { name: "More" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New transaction" })).toBeInTheDocument();
    // The wide-screen sidebar is not in the page at all.
    expect(screen.queryByRole("link", { name: "Achievements" })).not.toBeInTheDocument();
  });

  it("keeps everything else one tap away behind More", async () => {
    const { user } = renderApp("/dashboard");

    await user.click(await screen.findByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "More" });
    for (const label of ["Assistant", "Goals", "Subscriptions", "Recurring", "Categories", "Import", "Achievements", "Settings", "Security"]) {
      expect(within(sheet).getByRole("link", { name: label })).toBeInTheDocument();
    }

    await user.click(within(sheet).getByRole("link", { name: "Goals" }));

    expect(await screen.findByRole("heading", { name: "Savings goals" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "More" })).not.toBeInTheDocument();
  });
});
