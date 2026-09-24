import axios from "axios";

// A proxy/load balancer answering for a server that is down or restarting.
const SERVER_UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

/**
 * The request never got a real answer from the backend: no connection, a
 * timeout, or the server is down. Such requests may be answered from the local
 * cache (GET) or queued for later (creating a transaction).
 */
export function isOfflineError(error: unknown): boolean {
  if (!axios.isAxiosError(error) || axios.isCancel(error)) return false;
  if (!error.response) return true;
  return SERVER_UNAVAILABLE_STATUSES.has(error.response.status);
}
