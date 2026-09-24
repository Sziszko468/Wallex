/**
 * Reads a JWT's `exp` claim (as epoch milliseconds) WITHOUT verifying the
 * signature. Only used to decide *when* to refresh — the backend remains the
 * sole authority on whether a token is valid. Returns null for anything that
 * doesn't look like a JWT with a numeric `exp`.
 */
export function getTokenExpiry(token: string): number | null {
  const exp = getClaim(token, "exp");
  return typeof exp === "number" ? exp * 1000 : null;
}

/** The `user_id` claim simplejwt puts in every token (serialized as a string), or null. */
export function getTokenUserId(token: string): string | null {
  const userId = getClaim(token, "user_id");
  return typeof userId === "string" || typeof userId === "number" ? String(userId) : null;
}

function getClaim(token: string, name: string): unknown {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const claims: unknown = JSON.parse(atob(padded));
    return typeof claims === "object" && claims !== null ? (claims as Record<string, unknown>)[name] : null;
  } catch {
    return null;
  }
}

/**
 * True when the token expires within `marginMs` from now. A token whose expiry
 * can't be read counts as not expiring: the server's 401 is the fallback.
 */
export function expiresWithin(token: string, marginMs: number, now = Date.now()): boolean {
  const expiry = getTokenExpiry(token);
  return expiry !== null && expiry - now <= marginMs;
}
