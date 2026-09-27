import type { CurrencyCode } from "./currency";

export type AchievementCategory = "tracking" | "saving" | "budgeting";
export type AchievementUnit = "count" | "days" | "money";

/**
 * Shape of GET /api/achievements/ — the catalog with the user's progress. The server
 * decides everything here (progress, unlocking, titles); the client only displays it.
 */
export interface Achievement {
  code: string;
  name: string;
  /** What to show — personalized once unlocked, e.g. "Stayed Under Food Budget". */
  title: string;
  /** Once unlocked, what it was earned with ("August 2026", a goal's name); else null. */
  detail: string | null;
  description: string;
  /** An emoji. */
  icon: string;
  category: AchievementCategory;
  unit: AchievementUnit;
  /** Decimal strings; money ones are in `target_currency`. */
  target: string;
  target_currency: CurrencyCode | null;
  progress: string;
  /** 0–100. */
  progress_percentage: number;
  unlocked: boolean;
  unlocked_at: string | null;
  /** Unlocked but not shown to the user yet — cleared by POST /api/achievements/mark-seen/. */
  is_new: boolean;
}

export interface MarkSeenResult {
  marked: number;
}
