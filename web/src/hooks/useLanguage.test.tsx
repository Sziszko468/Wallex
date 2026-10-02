import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../i18n";
import { LANGUAGE_STORAGE_KEY } from "../i18n/languages";
import { user as userFixture } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";

const hungarianUser = { ...userFixture, language: "hu" };

describe("Language switch — signed out", () => {
  it("shows the interface in English by default", async () => {
    renderApp("/login");

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("switches to Hungarian, remembers it and sets the page language", async () => {
    const { user } = renderApp("/login");

    await user.click(await screen.findByRole("radio", { name: "Magyar" }));

    expect(await screen.findByRole("heading", { name: "Bejelentkezés" })).toBeInTheDocument();
    expect(screen.getByLabelText("Jelszó")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("hu");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("hu");
    expect(screen.getByRole("radio", { name: "Magyar" })).toBeChecked();
  });

  it("switches back to English", async () => {
    const { user } = renderApp("/login");

    await user.click(await screen.findByRole("radio", { name: "Magyar" }));
    await user.click(await screen.findByRole("radio", { name: "English" }));

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("names each language in itself, whatever language is showing", async () => {
    const { user } = renderApp("/login");
    await user.click(await screen.findByRole("radio", { name: "Magyar" }));

    const group = await screen.findByRole("radiogroup", { name: "Nyelv" });
    expect(within(group).getByRole("radio", { name: "English" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "Magyar" })).toBeInTheDocument();
  });

  it("translates the register page and sends the chosen language with the new account", async () => {
    const registrations: Record<string, unknown>[] = [];
    server.use(
      http.post(`${API}/auth/register/`, async ({ request }) => {
        registrations.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ ...userFixture, language: "hu" }, { status: 201 });
      }),
      http.post(`${API}/auth/login/`, () => HttpResponse.json({ detail: "stop here" }, { status: 400 }))
    );
    const { user } = renderApp("/register");
    await user.click(await screen.findByRole("radio", { name: "Magyar" }));

    expect(await screen.findByRole("heading", { name: "Fiók létrehozása" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("E-mail"), "anna@example.com");
    await user.type(screen.getByLabelText("Jelszó"), "correct horse battery");
    await user.type(screen.getByLabelText("Jelszó megerősítése"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Regisztráció" }));

    await waitFor(() => expect(registrations).toHaveLength(1));
    expect(registrations[0]).toMatchObject({ email: "anna@example.com", language: "hu" });
  });

  it("starts in the language that was saved on this device", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "hu");
    await i18n.changeLanguage("hu");

    renderApp("/login");

    expect(await screen.findByRole("heading", { name: "Bejelentkezés" })).toBeInTheDocument();
  });
});

describe("Language switch — requests", () => {
  it("tells the server the interface language with every request", async () => {
    const languages: (string | null)[] = [];
    server.use(
      http.post(`${API}/auth/login/`, ({ request }) => {
        languages.push(request.headers.get("accept-language"));
        return HttpResponse.json({ detail: "Hibás adatok." }, { status: 401 });
      })
    );
    const { user } = renderApp("/login");

    await user.type(await screen.findByLabelText("Email"), "anna@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByText("Hibás adatok.");

    await user.click(screen.getByRole("radio", { name: "Magyar" }));
    await user.type(await screen.findByLabelText("E-mail"), "anna@example.com");
    await user.type(screen.getByLabelText("Jelszó"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Bejelentkezés" }));
    await waitFor(() => expect(languages).toHaveLength(2));

    expect(languages).toEqual(["en", "hu"]);
  });

  it("shows the server's own message in whatever language it answered", async () => {
    server.use(
      http.post(`${API}/auth/login/`, () => HttpResponse.json({ detail: "Hibás e-mail-cím vagy jelszó." }, { status: 401 }))
    );
    const { user } = renderApp("/login");

    await user.type(await screen.findByLabelText("Email"), "anna@example.com");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Hibás e-mail-cím vagy jelszó.")).toBeInTheDocument();
  });
});

describe("Language switch — signed in", () => {
  beforeEach(() => signIn());

  it("saves a change to the account", async () => {
    const patches: unknown[] = [];
    server.use(
      http.patch(`${API}/auth/me/`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patches.push(body);
        return HttpResponse.json({ ...userFixture, ...body });
      })
    );
    const { user } = renderApp("/settings");

    const group = await screen.findByRole("radiogroup", { name: "Language" });
    await user.click(within(group).getByRole("radio", { name: "Magyar" }));

    expect(await screen.findByRole("heading", { name: "Beállítások", level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(patches).toEqual([{ language: "hu" }]));
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("hu");
  });

  it("does not save when the language is already the account's", async () => {
    const patches: unknown[] = [];
    server.use(http.patch(`${API}/auth/me/`, async ({ request }) => {
      patches.push(await request.json());
      return HttpResponse.json(userFixture);
    }));
    const { user } = renderApp("/settings");

    const group = await screen.findByRole("radiogroup", { name: "Language" });
    await user.click(within(group).getByRole("radio", { name: "English" }));

    expect(patches).toEqual([]);
  });

  it("keeps the change on this device when saving it fails", async () => {
    server.use(http.patch(`${API}/auth/me/`, () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    const { user } = renderApp("/settings");

    const group = await screen.findByRole("radiogroup", { name: "Language" });
    await user.click(within(group).getByRole("radio", { name: "Magyar" }));

    expect(await screen.findByRole("heading", { name: "Beállítások", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("hu");
  });

  it("uses the account's language after signing in, whatever this device had", async () => {
    server.use(http.get(`${API}/auth/me/`, () => HttpResponse.json(hungarianUser)));
    renderApp("/settings");

    expect(await screen.findByRole("heading", { name: "Beállítások", level: 1 })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("hu");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("hu");
  });

  it("formats the member-since date in the interface language", async () => {
    server.use(http.get(`${API}/auth/me/`, () => HttpResponse.json(hungarianUser)));
    renderApp("/settings");

    const memberSince = await screen.findByText("Tag ekkortól");
    expect(memberSince.closest("div")).toHaveTextContent(/szept/i);
  });

  it("reloads the page's data in the new language", async () => {
    const languages: (string | null)[] = [];
    server.use(
      http.get(`${API}/analytics/insights/`, ({ request }) => {
        languages.push(request.headers.get("accept-language"));
        return HttpResponse.json({ year: 2026, month: 9, insights: [] });
      })
    );
    const { user } = renderApp("/dashboard");
    await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Anna/ });
    await waitFor(() => expect(languages).toEqual(["en"]));

    await user.click(screen.getByRole("button", { name: /Anna Kovács/ }));
    await user.click(screen.getByRole("radio", { name: "Magyar" }));

    await screen.findByRole("heading", { name: /Jó (reggelt|napot|estét), Anna/ });
    await waitFor(() => expect(languages).toEqual(["en", "hu"]));
  });
});
