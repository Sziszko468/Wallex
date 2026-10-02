// Pure display formatting only — every number here already comes fully
// computed from the backend. Nothing in this file sums, divides, or
// otherwise derives a new financial figure. Numbers and dates follow the
// interface language (see i18n/languages.ts).
import { t } from "i18next";
import { currentLocale } from "../i18n";
import type { CurrencyCode } from "../types/currency";
import { CURRENCIES } from "./currency";

const MS_PER_DAY = 86_400_000;
const PERCENT_DECIMALS = 1;
const RATE_DECIMALS = 6;

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const percentFormatters = new Map<string, Intl.NumberFormat>();
const rateFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  const locale = currentLocale();
  const cacheKey = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(cacheKey);
  if (!formatter) {
    const { decimals } = CURRENCIES[currency];
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    currencyFormatters.set(cacheKey, formatter);
  }
  return formatter;
}

function percentFormatter(): Intl.NumberFormat {
  const locale = currentLocale();
  let formatter = percentFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: PERCENT_DECIMALS,
      maximumFractionDigits: PERCENT_DECIMALS,
    });
    percentFormatters.set(locale, formatter);
  }
  return formatter;
}

/** An exchange rate without trailing noise: "0.002564" (English), "0,002564" (Hungarian). */
export function formatRate(value: string | number): string {
  const locale = currentLocale();
  let formatter = rateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: RATE_DECIMALS });
    rateFormatters.set(locale, formatter);
  }
  return formatter.format(Number(value));
}

/**
 * `currency` is required on purpose: an amount means nothing without it. Use the
 * transaction's own currency for `amount`, and the user's base currency for
 * `base_amount` and every total (see hooks/useBaseCurrency).
 */
export function formatCurrency(value: string | number, currency: CurrencyCode): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  return currencyFormatter(currency).format(numeric);
}

/** A percentage the API already computed: "14.3%" (English) or "14,3%" (Hungarian). */
export function formatPercentage(value: number): string {
  return `${percentFormatter().format(value)}%`;
}

/** A change as the API reports it, with its sign: "+14.3%", "−5.0%". */
export function formatSignedPercentage(value: number): string {
  if (value > 0) return `+${formatPercentage(value)}`;
  if (value < 0) return `−${formatPercentage(Math.abs(value))}`;
  return formatPercentage(0);
}

/** "Sep", or "Sep 2025" when the year matters (charts spanning a year boundary). */
export function formatShortMonth(year: number, month: number, withYear = false): string {
  return new Date(year, month - 1, 1).toLocaleDateString(currentLocale(), {
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

const SAMPLE_YEAR = 2000;
// 1 January 2024 was a Monday, so day N of that January is ISO weekday N (1 = Monday … 7 = Sunday).
const MONDAY_SAMPLE = { year: 2024, monthIndex: 0 };

/** "Sep" / "September" for a month number (1–12), in the interface language. */
export function formatMonthName(month: number, style: "short" | "long" = "long"): string {
  return new Date(SAMPLE_YEAR, month - 1, 1).toLocaleDateString(currentLocale(), { month: style });
}

/** "Mon" / "Monday" for an ISO weekday number (1 = Monday … 7 = Sunday), in the interface language. */
export function formatWeekdayName(isoWeekday: number, style: "short" | "long" = "long"): string {
  return new Date(MONDAY_SAMPLE.year, MONDAY_SAMPLE.monthIndex, isoWeekday).toLocaleDateString(currentLocale(), {
    weekday: style,
  });
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(currentLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** A server timestamp (ISO 8601, UTC) in the viewer's time zone: "28 Sept 2026, 14:05". */
export function formatDateTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString(currentLocale(), { dateStyle: "medium", timeStyle: "short" });
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(currentLocale(), {
    month: "long",
    year: "numeric",
  });
}

/**
 * The heading above a day's transactions: "Today", "Yesterday", then the weekday and date
 * ("Tuesday 23 September" — with the year when it isn't this year). Built from local date
 * parts, so a "2026-09-23" transaction never slides to the day before in any time zone.
 */
export function formatDayHeading(isoDate: string, now: Date = new Date()): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.round((startOfToday.getTime() - date.getTime()) / MS_PER_DAY);
  if (daysAgo === 0) return t("common.dates.today");
  if (daysAgo === 1) return t("common.dates.yesterday");
  return date.toLocaleDateString(currentLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}
