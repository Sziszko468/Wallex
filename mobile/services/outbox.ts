import axios from "axios";
import * as Crypto from "expo-crypto";
import { createTransaction } from "./transactionsService";
import { SessionClosedError, SessionExpiredError } from "./session";
import { extractErrorMessage, extractFieldErrors } from "../utils/errors";
import { isOfflineError } from "../utils/network";
import { getOfflineUser, readUserJson, writeUserJson } from "../utils/offlineStore";
import type { CreateTransactionPayload } from "../types/transaction";

/**
 * Transactions recorded while offline, waiting to be sent to the backend.
 *
 * Deliberately create-only: editing or deleting existing transactions needs a
 * connection, which avoids real merge conflicts. Each item carries a
 * `client_id` (UUID) the backend uses as an idempotency key, so re-sending an
 * item whose first attempt actually reached the server never creates a
 * duplicate.
 */

export type PendingStatus = "pending" | "failed";

export interface PendingTransaction {
  client_id: string;
  payload: CreateTransactionPayload;
  /** "failed" = rejected by the backend (e.g. the category no longer exists) — needs the user. */
  status: PendingStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  /** Epoch ms before which a transient failure must not be retried (backoff). */
  next_attempt_at: number | null;
}

export interface SyncResult {
  synced: number;
}

const OUTBOX_NAME = "outbox";
const BASE_BACKOFF_MS = 15_000;
const MAX_BACKOFF_MS = 10 * 60_000;
// Worth retrying as-is: the server may accept the same data later.
const RETRYABLE_STATUSES = new Set([408, 429, 500]);

let items: readonly PendingTransaction[] = [];
let loadedForUser: number | null = null;
let syncPromise: Promise<SyncResult> | null = null;
let persistQueue: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function setItems(next: readonly PendingTransaction[]): void {
  items = next;
  listeners.forEach((listener) => listener());
}

/** Always writes the latest state, in order, so an older write can never land last. */
function persist(): Promise<void> {
  const write = persistQueue.then(() => writeUserJson(OUTBOX_NAME, items));
  persistQueue = write.catch(() => undefined);
  return write;
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOutboxSnapshot(): readonly PendingTransaction[] {
  return items;
}

/** Loads the signed-in user's outbox (see utils/offlineStore for the per-user namespace). */
export async function loadOutbox(): Promise<void> {
  const userId = getOfflineUser();
  if (userId === loadedForUser) return;
  loadedForUser = userId;
  setItems(userId === null ? [] : ((await readUserJson<PendingTransaction[]>(OUTBOX_NAME)) ?? []));
}

export function resetOutbox(): void {
  loadedForUser = null;
  setItems([]);
}

/** Uses `payload.client_id` when the caller already sent it once (so a retry stays idempotent). */
export async function enqueueTransaction(payload: CreateTransactionPayload): Promise<PendingTransaction> {
  const clientId = payload.client_id ?? Crypto.randomUUID();
  if (items.some((item) => item.client_id === clientId)) {
    throw new Error("This transaction is already waiting to sync.");
  }
  const item: PendingTransaction = {
    client_id: clientId,
    payload,
    status: "pending",
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
    next_attempt_at: null,
  };
  const previous = items;
  setItems([...items, item]);
  try {
    await persist();
  } catch (error) {
    // Never pretend it was saved: the caller must tell the user.
    setItems(previous);
    throw error;
  }
  return item;
}

async function updateItem(clientId: string, changes: Partial<PendingTransaction>): Promise<void> {
  setItems(items.map((item) => (item.client_id === clientId ? { ...item, ...changes } : item)));
  await persist();
}

export async function discardPending(clientId: string): Promise<void> {
  setItems(items.filter((item) => item.client_id !== clientId));
  await persist();
}

/** Puts a failed item back in the queue (e.g. after the user fixed the problem elsewhere). */
export async function retryPending(clientId: string): Promise<void> {
  await updateItem(clientId, { status: "pending", next_attempt_at: null, last_error: null });
}

/** Why the backend refused an item, phrased for someone who recorded it offline a while ago. */
function describeRejection(error: unknown): string {
  if (extractFieldErrors(error).category) {
    return "Its category no longer exists (it was deleted or changed meanwhile). Discard it and add it again with another category.";
  }
  return extractErrorMessage(error);
}

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
}

function isRetryable(error: unknown): boolean {
  if (isOfflineError(error)) return true;
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && RETRYABLE_STATUSES.has(status);
}

async function runSync(): Promise<SyncResult> {
  let synced = 0;
  for (const item of [...items]) {
    if (item.status !== "pending" || (item.next_attempt_at ?? 0) > Date.now()) continue;
    try {
      // 201 = created now, 200 = the server already had it (an earlier attempt whose response was lost).
      await createTransaction({ ...item.payload, client_id: item.client_id });
      await discardPending(item.client_id);
      synced += 1;
    } catch (error) {
      if (error instanceof SessionExpiredError || error instanceof SessionClosedError) {
        break; // keep everything; it syncs after the user signs in again
      }
      const attempts = item.attempts + 1;
      if (isRetryable(error)) {
        await updateItem(item.client_id, {
          attempts,
          next_attempt_at: Date.now() + backoffMs(attempts),
          last_error: extractErrorMessage(error),
        });
        break; // the backend is unreachable or struggling — don't hammer it with the rest
      }
      // Rejected by the backend (validation, or a conflict with server-side
      // changes such as a deleted category): sending the same data again can't
      // succeed, so it waits for the user.
      await updateItem(item.client_id, {
        status: "failed",
        attempts,
        next_attempt_at: null,
        last_error: describeRejection(error),
      });
    }
  }
  return { synced };
}

/** Sends due pending items to the backend. Concurrent calls share one run, so nothing is sent twice at once. */
export function syncOutbox(): Promise<SyncResult> {
  syncPromise ??= runSync().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}
