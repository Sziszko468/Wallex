import { apiClient } from "./apiClient";
import type {
  CreateRecurringTransactionPayload,
  RecurringTransaction,
  UpdateRecurringTransactionPayload,
} from "../types/recurringTransaction";

/** Not paginated — returns every recurring transaction for the current user. */
export async function listRecurringTransactions(): Promise<RecurringTransaction[]> {
  const response = await apiClient.get<RecurringTransaction[]>("/recurring-transactions/");
  return response.data;
}

export async function getRecurringTransaction(id: number): Promise<RecurringTransaction> {
  const response = await apiClient.get<RecurringTransaction>(`/recurring-transactions/${id}/`);
  return response.data;
}

export async function createRecurringTransaction(
  payload: CreateRecurringTransactionPayload
): Promise<RecurringTransaction> {
  const response = await apiClient.post<RecurringTransaction>(
    "/recurring-transactions/",
    payload
  );
  return response.data;
}

export async function updateRecurringTransaction(
  id: number,
  payload: UpdateRecurringTransactionPayload
): Promise<RecurringTransaction> {
  const response = await apiClient.patch<RecurringTransaction>(
    `/recurring-transactions/${id}/`,
    payload
  );
  return response.data;
}

export async function deleteRecurringTransaction(id: number): Promise<void> {
  await apiClient.delete(`/recurring-transactions/${id}/`);
}
