import axios from "axios";
import { HTTP_STATUS } from "../config/http";

// A proxy/load balancer answering for a server that is down or restarting.
const SERVER_UNAVAILABLE_STATUSES = new Set<number>([
  HTTP_STATUS.BAD_GATEWAY,
  HTTP_STATUS.SERVICE_UNAVAILABLE,
  HTTP_STATUS.GATEWAY_TIMEOUT,
]);

/** Django wrote the answer itself (a DRF error body): the backend is up, only one feature isn't. */
function answeredByBackend(data: unknown): boolean {
  return typeof data === "object" && data !== null && "detail" in data;
}

/**
 * The request never got a real answer from the backend: no connection, a
 * timeout, or the server is down. Such requests may be answered from the local
 * cache (GET) or queued for later (creating a transaction).
 *
 * A 503 from Django itself — receipt OCR or the AI assistant's model being
 * unavailable — is not "offline": the rest of the app keeps working live.
 */
export function isOfflineError(error: unknown): boolean {
  if (!axios.isAxiosError(error) || axios.isCancel(error)) return false;
  if (!error.response) return true;
  return SERVER_UNAVAILABLE_STATUSES.has(error.response.status) && !answeredByBackend(error.response.data);
}
