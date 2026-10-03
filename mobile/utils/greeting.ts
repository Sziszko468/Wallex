import { t } from "i18next";

const MORNING_START_HOUR = 5;
const AFTERNOON_START_HOUR = 12;
const EVENING_START_HOUR = 18;

/** "Good morning" / "Good afternoon" / "Good evening" for the hour of `date` (local time). */
export function greetingFor(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= MORNING_START_HOUR && hour < AFTERNOON_START_HOUR) return t("dashboard.greeting.morning");
  if (hour >= AFTERNOON_START_HOUR && hour < EVENING_START_HOUR) return t("dashboard.greeting.afternoon");
  return t("dashboard.greeting.evening");
}
