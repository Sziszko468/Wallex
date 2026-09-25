import axios from "axios";

/**
 * A log-safe one-line description of an error.
 *
 * An AxiosError carries the request config — including the Authorization
 * header and the request body (which holds the refresh token on /auth/refresh/
 * and /auth/logout/). Printing the error object itself would put live tokens
 * into the device log, readable via adb/Console by anyone with the phone.
 */
export function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status ? `HTTP ${status} (${error.code ?? "error"})` : `Network error (${error.code ?? "unknown"})`;
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function logWarning(label: string, error: unknown): void {
  console.warn(`${label}: ${describeError(error)}`);
}
