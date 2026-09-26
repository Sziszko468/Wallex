import type { CurrencyCode } from "../types/currency";

/**
 * Digits after the decimal point: 0 for forint and yen (whole numbers only).
 * Mirrors apps/currencies/models.py (DECIMALS).
 */
export const CURRENCY_DECIMALS: Record<CurrencyCode, number> = {
  EUR: 2,
  HUF: 0,
  USD: 2,
  GBP: 2,
  JPY: 0,
  CHF: 2,
};

/**
 * Whether a typed amount has no more decimals than the currency allows. A string
 * check, not arithmetic: "15000.00" HUF is fine, "15000.5" isn't. Two-decimal
 * currencies are left to the backend, which already enforces them.
 */
export function hasValidPrecision(amount: string, currency: CurrencyCode): boolean {
  return CURRENCY_DECIMALS[currency] > 0 || /^\d+(\.0*)?$/.test(amount.trim());
}
