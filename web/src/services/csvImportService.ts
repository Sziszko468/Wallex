import { apiClient } from "./apiClient";
import type { ImportSummary } from "../types/csvImport";

/** Multipart upload — do NOT set a Content-Type header manually here; axios
 * derives the correct multipart boundary from the FormData instance itself. */
export async function importTransactionsCsv(file: File): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<ImportSummary>("/transactions/import/", formData);
  return response.data;
}
