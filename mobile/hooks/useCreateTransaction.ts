import { useCallback, useState } from "react";
import * as Crypto from "expo-crypto";
import { useOffline } from "./useOffline";
import { createTransaction } from "../services/transactionsService";
import { isOfflineError } from "../utils/network";
import type { CreateTransactionPayload } from "../types/transaction";

/**
 * Creates one new transaction — online if possible, otherwise queued for sync.
 *
 * One idempotency key per hook instance (i.e. per form), reused by every
 * attempt (double tap, retry after an error, offline fallback): the backend
 * creates the transaction at most once, whichever attempt gets through.
 */
export function useCreateTransaction() {
  const { isOffline, saveOffline } = useOffline();
  const [clientId] = useState(() => Crypto.randomUUID());

  const create = useCallback(
    async (payload: Omit<CreateTransactionPayload, "client_id">): Promise<{ savedOffline: boolean }> => {
      const withKey = { ...payload, client_id: clientId };
      if (isOffline) {
        await saveOffline(withKey);
        return { savedOffline: true };
      }
      try {
        await createTransaction(withKey);
        return { savedOffline: false };
      } catch (error) {
        // The connection dropped mid-request: keep it locally instead of losing
        // it. If the request did reach the server, syncing the same client_id
        // returns the existing transaction instead of creating a second one.
        if (!isOfflineError(error)) throw error;
        await saveOffline(withKey);
        return { savedOffline: true };
      }
    },
    [clientId, isOffline, saveOffline]
  );

  return { create, isOffline };
}
