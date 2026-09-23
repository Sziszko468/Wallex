import { apiClient } from "./apiClient";
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

export async function updateTransaction(
  id: number,
  payload: UpdateTransactionPayload
): Promise<Transaction> {
  const response = await apiClient.patch<Transaction>(`/transactions/${id}/`, payload);
  return response.data;
}

export async function deleteTransaction(id: number): Promise<void> {
  await apiClient.delete(`/transactions/${id}/`);
}
