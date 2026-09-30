import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { getAccessToken } from "../utils/tokenStorage";
import { renderApp, signIn } from "./render";
import { API, server } from "./server";

async function submitPassword(user: ReturnType<typeof renderApp>["user"], password = "correct-horse-battery") {
  await user.type(await screen.findByLabelText("Email"), "anna@example.com");
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

describe("authentication & route protection", () => {
  it("sends a visitor without a session from a protected page to login", async () => {
    renderApp("/transactions");

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("logs in with the refresh token kept out of reach of page scripts", async () => {
    const headers: Record<string, string | null>[] = [];
    server.use(
      http.post(`${API}/auth/login/`, ({ request }) => {
        headers.push({
          transport: request.headers.get("X-Auth-Transport"),
          platform: request.headers.get("X-Client-Platform"),
        });
        return HttpResponse.json({ access: "a1" }); // the refresh token is an HttpOnly cookie
      })
    );
    const { user } = renderApp("/login");

    await submitPassword(user);

    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Anna/ })).toBeInTheDocument();
    expect(headers).toEqual([{ transport: "cookie", platform: "web" }]);
    expect(getAccessToken()).toBe("a1"); // in memory only
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("shows the backend's message for wrong credentials and stays on login", async () => {
    server.use(
      http.post(`${API}/auth/login/`, () =>
        HttpResponse.json({ detail: "No active account found with the given credentials" }, { status: 401 })
      )
    );
    const { user } = renderApp("/login");

    await submitPassword(user, "wrong");

    expect(await screen.findByText("No active account found with the given credentials")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("explains a locked account", async () => {
    server.use(
      http.post(`${API}/auth/login/`, () =>
        HttpResponse.json(
          { detail: "Too many failed sign-in attempts. Try again in 12 minutes.", code: "account_locked", retry_after: 704 },
          { status: 429 }
        )
      )
    );
    const { user } = renderApp("/login");

    await submitPassword(user);

    expect(await screen.findByText("Too many failed sign-in attempts. Try again in 12 minutes.")).toBeInTheDocument();
  });

  it("asks for the two-factor code after the password, then signs in", async () => {
    let verified: unknown = null;
    server.use(
      http.post(`${API}/auth/login/`, () =>
        HttpResponse.json({ mfa_required: true, mfa_token: "challenge-1", expires_in: 300 })
      ),
      http.post(`${API}/auth/login/verify/`, async ({ request }) => {
        verified = await request.json();
        return HttpResponse.json({ access: "a2" });
      })
    );
    const { user } = renderApp("/login");

    await submitPassword(user);
    await user.type(await screen.findByLabelText("Authentication code"), "492039");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Anna/ })).toBeInTheDocument();
    expect(verified).toEqual({ mfa_token: "challenge-1", code: "492039" });
    expect(getAccessToken()).toBe("a2");
  });

  it("stays on the code step when the code is wrong", async () => {
    server.use(
      http.post(`${API}/auth/login/`, () => HttpResponse.json({ mfa_required: true, mfa_token: "c", expires_in: 300 })),
      http.post(`${API}/auth/login/verify/`, () =>
        HttpResponse.json({ detail: "That code isn't right.", code: "mfa_code_invalid" }, { status: 401 })
      )
    );
    const { user } = renderApp("/login");

    await submitPassword(user);
    await user.type(await screen.findByLabelText("Authentication code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("That code isn't right.")).toBeInTheDocument();
    expect(screen.getByLabelText("Authentication code")).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("restores the session on reload from the refresh cookie", async () => {
    signIn();
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Anna/ })).toBeInTheDocument();
    expect(getAccessToken()).toBe("access-token");
  });

  it("shows the login page when the session has ended (e.g. signed out everywhere)", async () => {
    server.use(
      http.post(`${API}/auth/refresh/`, () =>
        HttpResponse.json({ detail: "Your session has ended. Please sign in again.", code: "session_ended" }, { status: 401 })
      )
    );
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("deletes tokens an older version left in localStorage", async () => {
    localStorage.setItem("spendly_access_token", "old-access");
    localStorage.setItem("spendly_refresh_token", "old-refresh");
    renderApp("/login");

    await screen.findByRole("heading", { name: "Log in" });
    expect(localStorage.getItem("spendly_refresh_token")).toBeNull();
    expect(localStorage.getItem("spendly_access_token")).toBeNull();
  });

  it("redirects a signed-in user away from the login page", async () => {
    signIn();
    renderApp("/login");

    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Anna/ })).toBeInTheDocument();
  });

  it("logs out: ends the session on the server and forgets the access token", async () => {
    let logout: { transport: string | null; body: unknown } | null = null;
    server.use(
      http.post(`${API}/auth/logout/`, async ({ request }) => {
        logout = { transport: request.headers.get("X-Auth-Transport"), body: await request.json() };
        return HttpResponse.json({ detail: "Logged out successfully." });
      })
    );
    signIn();
    const { user } = renderApp("/settings");

    const settings = await screen.findByRole("main");
    await user.click(await within(settings).findByRole("button", { name: /^log out$/i }));

    await screen.findByRole("heading", { name: "Log in" });
    await waitFor(() => expect(logout).toEqual({ transport: "cookie", body: {} }));
    expect(getAccessToken()).toBeNull();
  });
});
