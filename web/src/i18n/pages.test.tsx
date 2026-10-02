import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { subscriptionSummary, user as userFixture } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";
import { hu } from "./locales/hu";

/** Every screen of the app, in Hungarian: its main heading comes from the Hungarian catalog. */
const SIGNED_IN_PAGES: [path: string, heading: string | RegExp][] = [
  ["/dashboard", /^(Jó reggelt|Jó napot|Jó estét), Anna$/],
  ["/assistant", hu.assistant.title],
  ["/transactions", hu.transactions.title],
  ["/recurring", hu.recurring.title],
  ["/subscriptions", hu.subscriptions.title],
  ["/budgets", hu.budgets.title],
  ["/goals", hu.goals.title],
  ["/achievements", hu.achievements.title],
  ["/import", hu.importCsv.title],
  ["/categories", hu.categories.title],
  ["/settings", hu.settings.title],
  ["/settings/security", hu.security.page.title],
];

const GUEST_PAGES: [path: string, heading: string][] = [
  ["/login", hu.auth.login.title],
  ["/register", hu.auth.register.title],
];

function emptyBackend() {
  server.use(
    http.get(`${API}/auth/me/`, () => HttpResponse.json({ ...userFixture, language: "hu" })),
    http.get(`${API}/budgets/`, () => HttpResponse.json([])),
    http.get(`${API}/recurring-transactions/`, () => HttpResponse.json([])),
    http.get(`${API}/subscriptions/`, () => HttpResponse.json([])),
    http.get(`${API}/subscriptions/summary/`, () => HttpResponse.json(subscriptionSummary)),
    http.get(`${API}/assistant/`, () =>
      HttpResponse.json({ available: true, suggested_questions: [], max_question_length: 1000 })
    ),
    http.get(`${API}/assistant/conversations/`, () =>
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] })
    ),
    http.get(`${API}/auth/sessions/`, () => HttpResponse.json([])),
    http.get(`${API}/auth/2fa/`, () => HttpResponse.json({ enabled: false, enabled_at: null, recovery_codes_left: 0 })),
    http.get(`${API}/auth/security-events/`, () =>
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] })
    )
  );
}

describe("Every page in Hungarian", () => {
  it.each(SIGNED_IN_PAGES)("%s shows its Hungarian heading and tab title", async (path, heading) => {
    signIn();
    emptyBackend();
    renderApp(path);

    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toMatch(/ · WALLEX$/));
    expect(document.documentElement.lang).toBe("hu");
  });

  it.each(GUEST_PAGES)("%s shows its Hungarian heading", async (path, heading) => {
    const { user } = renderApp(path);

    await user.click(await screen.findByRole("radio", { name: "Magyar" }));

    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it("names the navigation in Hungarian", async () => {
    signIn();
    emptyBackend();
    renderApp("/budgets");

    const nav = await screen.findByRole("navigation", { name: hu.nav.primary });
    // Settings and Security live outside the primary navigation (sidebar footer, account menu).
    const { settings, security, ...primary } = hu.nav.items;
    for (const label of Object.values(primary)) {
      expect(nav).toHaveTextContent(label);
    }
    expect(screen.getByRole("link", { name: settings })).toBeInTheDocument();
    expect(security).toBe("Biztonság");
    expect(screen.getByRole("link", { name: hu.common.skipToContent })).toBeInTheDocument();
  });
});
