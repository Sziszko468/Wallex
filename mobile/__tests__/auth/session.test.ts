import axios from "axios";
import {
  activateSession,
  clearSession,
  getValidAccessToken,
  isSessionActive,
  revokeSession,
  SessionClosedError,
  SessionExpiredError,
  setOnSessionExpired,
  startSession,
  suspendSession,
} from "../../services/session";
import { getRefreshToken, setRefreshToken } from "../../utils/tokenStorage";
import { httpError, makeJwt, networkError } from "../helpers/tokens";

const postSpy = jest.spyOn(axios, "post");

function refreshResponds(access: string, refresh: string) {
  postSpy.mockResolvedValueOnce({ data: { access, refresh } });
}

describe("session (token lifecycle)", () => {
  const onExpired = jest.fn();

  beforeEach(async () => {
    postSpy.mockReset();
    onExpired.mockReset();
    setOnSessionExpired(onExpired);
    await clearSession();
  });

  it("keeps the access token in memory only; persists just the refresh token", async () => {
    const access = makeJwt({ expiresInSeconds: 900 });
    await startSession({ access, refresh: "refresh-1" });

    expect(await getValidAccessToken()).toBe(access);
    expect(await getRefreshToken()).toBe("refresh-1");
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("refreshes proactively shortly before the access token expires and stores the rotated refresh", async () => {
    await startSession({ access: makeJwt({ expiresInSeconds: 30 }), refresh: makeJwt({ expiresInSeconds: 3600 }) });
    refreshResponds("fresh-access", "rotated-refresh");

    expect(await getValidAccessToken()).toBe("fresh-access");
    expect(postSpy).toHaveBeenCalledWith(expect.stringContaining("/auth/refresh/"), expect.any(Object), expect.any(Object));
    expect(await getRefreshToken()).toBe("rotated-refresh");
  });

  it("concurrent requests share one refresh (the backend blacklists rotated tokens)", async () => {
    await startSession({ access: makeJwt({ expiresInSeconds: 1 }), refresh: makeJwt({ expiresInSeconds: 3600 }) });
    postSpy.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { access: "shared", refresh: "r2" } }), 10))
    );

    const tokens = await Promise.all([getValidAccessToken(), getValidAccessToken(), getValidAccessToken()]);

    expect(tokens).toEqual(["shared", "shared", "shared"]);
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it("a rejected refresh token ends the session everywhere and reports expiry once", async () => {
    await startSession({ access: makeJwt({ expiresInSeconds: 1 }), refresh: makeJwt({ expiresInSeconds: 3600 }) });
    postSpy.mockRejectedValueOnce(httpError(401, { detail: "Token is blacklisted" }));

    await expect(getValidAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(await getRefreshToken()).toBeNull();
    expect(isSessionActive()).toBe(false);
  });

  it("being offline is NOT an expiry: the session is kept for later", async () => {
    await startSession({ access: makeJwt({ expiresInSeconds: 1 }), refresh: makeJwt({ expiresInSeconds: 3600 }) });
    postSpy.mockRejectedValueOnce(networkError());

    await expect(getValidAccessToken()).rejects.toMatchObject({ code: "ERR_NETWORK" });

    expect(onExpired).not.toHaveBeenCalled();
    expect(await getRefreshToken()).not.toBeNull();
    expect(isSessionActive()).toBe(true);
  });

  it("a refresh token past its own expiry is not even sent", async () => {
    await setRefreshToken(makeJwt({ expiresInSeconds: -60 }));
    activateSession();

    await expect(getValidAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("a refresh that finishes after logout cannot bring the session back", async () => {
    await startSession({ access: makeJwt({ expiresInSeconds: 1 }), refresh: makeJwt({ expiresInSeconds: 3600 }) });
    let finish: (value: unknown) => void = () => {};
    postSpy.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));

    const pending = getValidAccessToken();
    await clearSession(); // user logs out while the refresh is in flight
    finish({ data: { access: "late", refresh: "late-refresh" } });

    await expect(pending).rejects.toBeInstanceOf(SessionClosedError);
    expect(await getRefreshToken()).toBeNull();
  });

  it("no token is handed out while the session is locked/suspended", async () => {
    await startSession({ access: makeJwt({ expiresInSeconds: 900 }), refresh: "r" });
    suspendSession();

    expect(await getValidAccessToken()).toBeNull();
  });

  it("logout revokes the CURRENT refresh token on the server", async () => {
    const refresh = makeJwt({ expiresInSeconds: 3600 });
    await startSession({ access: makeJwt({ expiresInSeconds: 900 }), refresh });
    postSpy.mockResolvedValueOnce({ data: {} });

    await revokeSession();

    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining("/auth/logout/"),
      { refresh },
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }) })
    );
  });
});
