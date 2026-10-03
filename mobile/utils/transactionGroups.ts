import { t } from "i18next";
import { currentLocale } from "../i18n";
import { toIsoDate } from "./date";

export interface DaySection<T> {
  /** "YYYY-MM-DD" — the key of the day. */
  date: string;
  /** "Today", "Yesterday", or "Friday, September 25". */
  title: string;
  data: T[];
}

/** A "YYYY-MM-DD" date as a local calendar day. (new Date("2026-09-25") is UTC midnight and can land on the day before.) */
function localDay(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

/** The heading over a day's transactions. */
export function formatDayHeading(isoDate: string, now: Date = new Date()): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isoDate === toIsoDate(now)) return t("common.dates.today");
  if (isoDate === toIsoDate(yesterday)) return t("common.dates.yesterday");
  return localDay(isoDate).toLocaleDateString(currentLocale(), { weekday: "long", month: "long", day: "numeric" });
}

/**
 * Splits a list that is already sorted by date (the API's order) into one section per day,
 * keeping every item exactly as it came.
 */
export function groupByDay<T extends { date: string }>(items: readonly T[], now: Date = new Date()): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (last && last.date === item.date) {
      last.data.push(item);
    } else {
      sections.push({ date: item.date, title: formatDayHeading(item.date, now), data: [item] });
    }
  }
  return sections;
}
