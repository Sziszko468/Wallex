// Pure display formatting only — every number here already comes fully
// computed from the backend. Nothing in this file sums, divides, or
// otherwise derives a new financial figure.
import type { CurrencyCode } from "../types/currency";
import { CURRENCIES } from "./currency";

const currencyFormatters = new Map<CurrencyCode, Intl.NumberFormat>();

function currencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    const { decimals } = CURRENCIES[currency];
    formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    currencyFormatters.set(currency, formatter);
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

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** A change as the API reports it, with its sign: "+14.3%", "−5.0%". */
export function formatSignedPercentage(value: number): string {
  if (value > 0) return `+${value.toFixed(1)}%`;
  if (value < 0) return `−${Math.abs(value).toFixed(1)}%`;
  return "0.0%";
}

/** "Sep", or "Sep 2025" when the year matters (charts spanning a year boundary). */
export function formatShortMonth(year: number, month: number, withYear = false): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** A server timestamp (ISO 8601, UTC) in the viewer's time zone: "Sep 28, 2026, 14:05". */
export function formatDateTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}
