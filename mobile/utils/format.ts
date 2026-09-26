// Pure display formatting only — every number here already comes fully
// computed from the backend. Nothing in this file sums, divides, or
// otherwise derives a new financial figure.
import type { CurrencyCode } from "../types/currency";
import { CURRENCY_DECIMALS } from "./currency";

const currencyFormatters = new Map<CurrencyCode, Intl.NumberFormat>();

function currencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    const decimals = CURRENCY_DECIMALS[currency];
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

export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Compact date for narrow list rows, e.g. "Sep 10" — the mobile equivalent of web's formatDate. */
export function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Full date with year, for single-item detail views. */
export function formatFullDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
