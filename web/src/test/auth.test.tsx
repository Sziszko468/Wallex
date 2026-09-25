import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { getAccessToken, getRefreshToken } from "../utils/tokenStorage";
import { renderApp, signIn } from "./render";
import { API, server } from "./server";

describe("authentication & route protection", () => {
  it("sends a visitor without a session from a protected page to login", async () => {
    renderApp("/transactions");

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("logs in and lands on the dashboard", async () => {
    server.use(
      http.post(`${API}/auth/login/`, () => HttpResponse.json({ access: "a1", refresh: "r1" }))
    );
    const { user } = renderApp("/login");

    await user.type(await screen.findByLabelText("Email"), "anna@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("heading", { name: /Anna's Dashboard/ })).toBeInTheDocument();
    expect(getAccessToken()).toBe("a1");
    expect(getRefreshToken()).toBe("r1");
  });

  it("shows the backend's message for wrong credentials and stays on login", async () => {
    server.use(
      http.post(`${API}/auth/login/`, () =>
        HttpResponse.json({ detail: "No active account found with the given credentials" }, { status: 401 })
      )
    );
    const { user } = renderApp("/login");

    await user.type(await screen.findByLabelText("Email"), "anna@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("No active account found with the given credentials")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("restores a stored session on reload", async () => {
    signIn();
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: /Anna's Dashboard/ })).toBeInTheDocument();
  });

  it("drops a session the server no longer accepts", async () => {
    signIn();
    server.use(
      http.get(`${API}/auth/me/`, () => HttpResponse.json({ detail: "invalid" }, { status: 401 })),
      http.post(`${API}/auth/refresh/`, () => HttpResponse.json({ detail: "blacklisted" }, { status: 401 }))
    );
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("keeps the session when the backend is merely unreachable during startup", async () => {
    signIn();
    server.use(http.get(`${API}/auth/me/`, () => HttpResponse.error()));
    renderApp("/dashboard");

    await screen.findByRole("heading", { name: "Log in" });
    // Tokens survive, so the next reload with a working backend restores the session.
    expect(getAccessToken()).toBe("access-token");
    expect(getRefreshToken()).toBe("refresh-token");
  });

  it("redirects a signed-in user away from the login page", async () => {
    signIn();
    renderApp("/login");

    expect(await screen.findByRole("heading", { name: /Anna's Dashboard/ })).toBeInTheDocument();
  });

  it("logs out: blacklists the refresh token and clears the session", async () => {
    let revoked: unknown = null;
    server.use(
      http.post(`${API}/auth/logout/`, async ({ request }) => {
        revoked = await request.json();
        return HttpResponse.json({ detail: "Logged out successfully." });
      })
    );
    signIn();
    const { user } = renderApp("/settings");

    const settings = await screen.findByRole("main");
    await user.click(await within(settings).findByRole("button", { name: /log out/i }));

    await screen.findByRole("heading", { name: "Log in" });
    await waitFor(() => expect(revoked).toEqual({ refresh: "refresh-token" }));
    expect(getAccessToken()).toBeNull();
  });
});
