import { apiClient } from "./apiClient";
import type { Category } from "../types/category";

/** Not paginated — returns every category (system + custom) for the current user. */
export async function listCategories(): Promise<Category[]> {
  const response = await apiClient.get<Category[]>("/categories/");
  return response.data;
}
