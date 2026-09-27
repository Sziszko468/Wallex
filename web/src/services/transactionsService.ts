import { apiClient } from "./apiClient";
import { ifMatch } from "./concurrency";
import type { PaginatedResponse } from "../types/api";
import type {
  CreateTransactionPayload,
  Transaction,
  TransactionListParams,
  UpdateTransactionPayload,
} from "../types/transaction";

export async function listTransactions(
  params?: TransactionListParams
): Promise<PaginatedResponse<Transaction>> {
  const response = await apiClient.get<PaginatedResponse<Transaction>>("/transactions/", {
    params,
  });
  return response.data;
}

export async function createTransaction(
  payload: CreateTransactionPayload
): Promise<Transaction> {
  const response = await apiClient.post<Transaction>("/transactions/", payload);
  return response.data;
}

/**
 * `version` is the transaction's `updated_at` as loaded. If it has changed since (on another
 * device), the server refuses with 412 and nothing is saved — see utils/errors.ts isConflict().
 */
export async function updateTransaction(
  id: number,
  payload: UpdateTransactionPayload,
  version?: string
): Promise<Transaction> {
  const response = await apiClient.patch<Transaction>(`/transactions/${id}/`, payload, {
    headers: ifMatch(version),
  });
  return response.data;
}

export async function deleteTransaction(id: number, version?: string): Promise<void> {
  await apiClient.delete(`/transactions/${id}/`, { headers: ifMatch(version) });
}
