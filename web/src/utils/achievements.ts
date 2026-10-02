import { t } from "i18next";
import type { Achievement } from "../types/achievement";
import { formatCurrency } from "./format";

/** "3 / 7 days", "€412.50 / €1,000.00", "0 / 1" — display only, from the API's values. */
export function describeProgress(achievement: Achievement): string {
  const { progress, target, unit, target_currency: currency } = achievement;
  if (unit === "money" && currency) {
    return `${formatCurrency(progress, currency)} / ${formatCurrency(target, currency)}`;
  }
  const values = { progress: Number(progress), target: Number(target) };
  return unit === "days" ? t("achievements.progressDays", values) : `${values.progress} / ${values.target}`;
}

/** The locked achievement closest to being unlocked (highest progress), if any has started. */
export function nextUp(achievements: Achievement[]): Achievement | null {
  const started = achievements.filter((achievement) => !achievement.unlocked && achievement.progress_percentage > 0);
  return started.reduce<Achievement | null>(
    (best, achievement) => (!best || achievement.progress_percentage > best.progress_percentage ? achievement : best),
    null
  );
}

/** Unlocked achievements, most recent first. */
export function recentlyUnlocked(achievements: Achievement[]): Achievement[] {
  return achievements
    .filter((achievement) => achievement.unlocked && achievement.unlocked_at)
    .sort((a, b) => (b.unlocked_at ?? "").localeCompare(a.unlocked_at ?? ""));
}
