import { apiClient } from "./apiClient";
import type { SyncStatus } from "../types/sync";

/** Cheap change detection: one query on the server, no data downloaded. */
export async function getSyncStatus(): Promise<SyncStatus> {
  const response = await apiClient.get<SyncStatus>("/sync/status/");
  return response.data;
}
