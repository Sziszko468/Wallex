import { apiClient } from "./apiClient";
import type {
  CreateSavingsGoalPayload,
  SavingsGoal,
  SavingsSummary,
  UpdateSavingsGoalPayload,
} from "../types/savingsGoal";

/** Not paginated — active goals first, then completed, then archived; nearest target date first. */
export async function listSavingsGoals(): Promise<SavingsGoal[]> {
  const response = await apiClient.get<SavingsGoal[]>("/savings-goals/");
  return response.data;
}

export async function getSavingsGoal(id: number): Promise<SavingsGoal> {
  const response = await apiClient.get<SavingsGoal>(`/savings-goals/${id}/`);
  return response.data;
}

export async function createSavingsGoal(payload: CreateSavingsGoalPayload): Promise<SavingsGoal> {
  const response = await apiClient.post<SavingsGoal>("/savings-goals/", payload);
  return response.data;
}

export async function updateSavingsGoal(id: number, payload: UpdateSavingsGoalPayload): Promise<SavingsGoal> {
  const response = await apiClient.patch<SavingsGoal>(`/savings-goals/${id}/`, payload);
  return response.data;
}

export async function deleteSavingsGoal(id: number): Promise<void> {
  await apiClient.delete(`/savings-goals/${id}/`);
}

/** Adds money on the server (atomically) and returns the updated goal — the client never sums. */
export async function depositToSavingsGoal(id: number, amount: string): Promise<SavingsGoal> {
  const response = await apiClient.post<SavingsGoal>(`/savings-goals/${id}/deposit/`, { amount });
  return response.data;
}

/** Removes money on the server (at most what is saved) and returns the updated goal. */
export async function withdrawFromSavingsGoal(id: number, amount: string): Promise<SavingsGoal> {
  const response = await apiClient.post<SavingsGoal>(`/savings-goals/${id}/withdraw/`, { amount });
  return response.data;
}

export async function getSavingsSummary(): Promise<SavingsSummary> {
  const response = await apiClient.get<SavingsSummary>("/savings-goals/summary/");
  return response.data;
}
