import { apiClient } from "./apiClient";
import type { Achievement, MarkSeenResult } from "../types/achievement";

/** Every achievement with progress, in catalog order. Evaluated (and new ones unlocked) by the server on read. */
export async function listAchievements(): Promise<Achievement[]> {
  const response = await apiClient.get<Achievement[]>("/achievements/");
  return response.data;
}

/** Clears `is_new` on every unlocked achievement. */
export async function markAchievementsSeen(): Promise<MarkSeenResult> {
  const response = await apiClient.post<MarkSeenResult>("/achievements/mark-seen/");
  return response.data;
}
