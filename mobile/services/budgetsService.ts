import { apiClient } from "./apiClient";
import type { Budget } from "../types/budget";

/** Not paginated — returns every budget for the current user. */
export async function listBudgets(): Promise<Budget[]> {
  const response = await apiClient.get<Budget[]>("/budgets/");
  return response.data;
}
