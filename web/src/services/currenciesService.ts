import { apiClient } from "./apiClient";
import type { ConversionParams, ConversionPreview } from "../types/currency";

/** What a transaction would be worth in the user's base currency — computed by the backend. */
export async function convertAmount(params: ConversionParams): Promise<ConversionPreview> {
  const response = await apiClient.get<ConversionPreview>("/currencies/convert/", { params });
  return response.data;
}
