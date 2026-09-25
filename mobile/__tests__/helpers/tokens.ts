import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** An unsigned JWT with the claims the client reads (the client never verifies signatures). */
export function makeJwt({ expiresInSeconds, userId = 1 }: { expiresInSeconds: number; userId?: number }): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${base64url({ alg: "HS256" })}.${base64url({ exp, user_id: String(userId) })}.signature`;
}

/** No response at all: offline, DNS failure, timeout. */
export function networkError(): AxiosError {
  return new AxiosError("Network Error", "ERR_NETWORK", { headers: new AxiosHeaders() });
}

/** A real HTTP error response from the backend. */
export function httpError(status: number, data: unknown = {}): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response = { status, statusText: "", headers: {}, config, data } as AxiosResponse;
  return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", config, null, response);
}
