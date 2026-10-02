// Pure display formatting only — every number here already comes fully
// computed from the backend. Nothing in this file sums, divides, or
// otherwise derives a new financial figure. Numbers and dates follow the
// interface language (see i18n/languages.ts).
import { currentLocale } from "../i18n";
import type { CurrencyCode } from "../types/currency";
import { CURRENCY_DECIMALS } from "./currency";

const PERCENT_DECIMALS = 1;
const SAMPLE_YEAR = 2000;

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const percentFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  const locale = currentLocale();
  const cacheKey = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(cacheKey);
  if (!formatter) {
    const decimals = CURRENCY_DECIMALS[currency];
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
  const locale = currentLocale();
  let formatter = percentFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: PERCENT_DECIMALS,
      maximumFractionDigits: PERCENT_DECIMALS,
    });
    percentFormatters.set(locale, formatter);
  }
  return `${formatter.format(value)}%`;
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(currentLocale(), {
    month: "long",
    year: "numeric",
  });
}

/** "Sep" / "September" for a month number (1–12), in the interface language. */
export function formatMonthName(month: number, style: "short" | "long" = "long"): string {
  return new Date(SAMPLE_YEAR, month - 1, 1).toLocaleDateString(currentLocale(), { month: style });
}

/** Compact date for narrow list rows, e.g. "10 Sep" — the mobile equivalent of web's formatDate. */
export function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(currentLocale(), {
    month: "short",
    day: "numeric",
  });
}

/** Full date with year, for single-item detail views. */
export function formatFullDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(currentLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** A moment in the viewer's time zone: "10 Sep, 14:05". */
export function formatDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(currentLocale(), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The clock time of an ISO timestamp: "14:05". */
export function formatClockTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString(currentLocale(), { hour: "2-digit", minute: "2-digit" });
}
