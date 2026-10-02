import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";
import type { MfaStatus, SecurityEvent, Session } from "../types/security";

const thisBrowser: Session = {
  id: 1,
  platform: "web",
  user_agent: "Mozilla/5.0 Firefox/135.0",
  ip_address: "127.0.0.1",
  created_at: "2026-09-27T08:00:00Z",
  last_used_at: "2026-09-28T09:00:00Z",
  expires_at: "2026-10-27T08:00:00Z",
  current: true,
};
const phone: Session = { ...thisBrowser, id: 2, platform: "ios", user_agent: "WALLEX/1.0 iPhone", current: false };

const off: MfaStatus = { enabled: false, enabled_at: null, recovery_codes_left: 0 };

function securityBackend({ sessions = [thisBrowser, phone], mfa = off, events = [] as SecurityEvent[] } = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let current = [...sessions];
  server.use(
    http.get(`${API}/auth/sessions/`, () => HttpResponse.json(current)),
    http.delete(`${API}/auth/sessions/:id/`, ({ params }) => {
      calls.push({ method: "DELETE", path: `sessions/${params.id}` });
      current = current.filter((session) => String(session.id) !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${API}/auth/2fa/`, () => HttpResponse.json(mfa)),
    http.get(`${API}/auth/security-events/`, () =>
      HttpResponse.json({ count: events.length, next: null, previous: null, results: events })
    )
  );
  return calls;
}

async function card(title: string) {
  return (await screen.findByRole("heading", { name: title })).closest("div") as HTMLElement;
}

describe("Security page", () => {
  beforeEach(() => signIn());

  it("lists the signed-in devices and marks this one", async () => {
    securityBackend();
    renderApp("/settings/security");

    const devices = await card("Signed-in devices");
    expect(await within(devices).findByText("iPhone app")).toBeInTheDocument();
    expect(within(devices).getByText("This device")).toBeInTheDocument();
    // This device can't be signed out from the list (use "Log out" instead); the other one can.
    expect(within(devices).getAllByRole("button", { name: /^Sign out/ })).toHaveLength(1);
  });

  it("signs a lost phone out", async () => {
    const calls = securityBackend();
    const { user } = renderApp("/settings/security");

    const devices = await card("Signed-in devices");
    await user.click(await within(devices).findByRole("button", { name: /^Sign out iPhone app/ }));

    await waitFor(() => expect(calls).toEqual([{ method: "DELETE", path: "sessions/2" }]));
    await waitFor(() => expect(within(devices).queryByText("iPhone app")).not.toBeInTheDocument());
  });

  it("logs out of all devices after confirming", async () => {
    securityBackend();
    let loggedOutEverywhere = false;
    server.use(
      http.post(`${API}/auth/logout-all/`, () => {
        loggedOutEverywhere = true;
        return HttpResponse.json({ revoked_sessions: 2 });
      })
    );
    const { user } = renderApp("/settings/security");

    await user.click(await screen.findByRole("button", { name: "Log out of all devices" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Log out everywhere" }));

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(loggedOutEverywhere).toBe(true);
  });

  it("changes the password and reports the devices signed out", async () => {
    securityBackend();
    let sent: unknown = null;
    server.use(
      http.post(`${API}/auth/password/`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ detail: "ok", revoked_sessions: 1 });
      })
    );
    const { user } = renderApp("/settings/security");

    const password = await card("Password");
    await user.type(within(password).getByLabelText("Current password"), "old password here");
    await user.type(within(password).getByLabelText("New password"), "a sturdy passphrase 2026");
    await user.type(within(password).getByLabelText("Repeat the new password"), "a sturdy passphrase 2026");
    await user.click(within(password).getByRole("button", { name: "Change password" }));

    expect(await within(password).findByText("Password changed. 1 other device was signed out.")).toBeInTheDocument();
    expect(sent).toEqual({ current_password: "old password here", new_password: "a sturdy passphrase 2026" });
  });

  it("shows the server's password policy message next to the field", async () => {
    securityBackend();
    server.use(
      http.post(`${API}/auth/password/`, () =>
        HttpResponse.json(
          { new_password: ["This password is too short. It must contain at least 12 characters."] },
          { status: 400 }
        )
      )
    );
    const { user } = renderApp("/settings/security");

    const password = await card("Password");
    await user.type(within(password).getByLabelText("Current password"), "old password here");
    await user.type(within(password).getByLabelText("New password"), "short");
    await user.type(within(password).getByLabelText("Repeat the new password"), "short");
    await user.click(within(password).getByRole("button", { name: "Change password" }));

    expect(
      await within(password).findByText("This password is too short. It must contain at least 12 characters.")
    ).toBeInTheDocument();
  });

  it("turns two-factor authentication on and shows the recovery codes once", async () => {
    securityBackend();
    server.use(
      http.post(`${API}/auth/2fa/setup/`, () =>
        HttpResponse.json({
          secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
          otpauth_uri: "otpauth://totp/WALLEX:anna%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
        })
      ),
      http.post(`${API}/auth/2fa/confirm/`, () => HttpResponse.json({ recovery_codes: ["k3m9-q2xa", "p7tn-w4ds"] }))
    );
    const { user } = renderApp("/settings/security");

    const twoFactor = await card("Two-factor authentication");
    await user.click(await within(twoFactor).findByRole("button", { name: "Turn on two-factor authentication" }));
    await user.type(within(twoFactor).getByLabelText("Password"), "my password");
    await user.click(within(twoFactor).getByRole("button", { name: "Continue" }));

    expect(await within(twoFactor).findByLabelText("Setup key")).toHaveTextContent("JBSW Y3DP EHPK 3PXP");
    expect(within(twoFactor).getByRole("link", { name: "open this setup link" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^otpauth:\/\/totp\//)
    );
    await user.type(within(twoFactor).getByLabelText("Code from the app"), "492039");
    await user.click(within(twoFactor).getByRole("button", { name: "Turn on" }));

    const codes = await within(twoFactor).findByRole("list", { name: "Recovery codes" });
    expect(within(codes).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["k3m9-q2xa", "p7tn-w4ds"]);
  });

  it("shows the recent sign-ins, failed ones included", async () => {
    securityBackend({
      events: [
        {
          id: 9,
          action: "login_failed",
          description: "Wrong email or password",
          category: "login",
          ip_address: "203.0.113.7",
          user_agent: "curl/8.0",
          metadata: {},
          created_at: "2026-09-28T07:00:00Z",
        },
      ],
    });
    renderApp("/settings/security");

    const history = await card("Recent sign-ins");
    expect(await within(history).findByText("Wrong email or password")).toBeInTheDocument();
    expect(within(history).getByText(/203\.0\.113\.7/)).toBeInTheDocument();
  });
});
