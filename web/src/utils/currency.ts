import type { CurrencyCode } from "../types/currency";

interface CurrencyInfo {
  name: string;
  /** Digits after the decimal point: 0 for forint and yen (whole numbers only). */
  decimals: number;
}

/** Mirrors apps/currencies/models.py (Currency + DECIMALS). */
export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  EUR: { name: "Euro", decimals: 2 },
  HUF: { name: "Hungarian forint", decimals: 0 },
  USD: { name: "US dollar", decimals: 2 },
  GBP: { name: "British pound", decimals: 2 },
  JPY: { name: "Japanese yen", decimals: 0 },
  CHF: { name: "Swiss franc", decimals: 2 },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value in CURRENCIES;
}

/** `step` for an amount input: "0.01", or "1" for whole-number currencies. */
export function amountStep(currency: CurrencyCode): string {
  return CURRENCIES[currency].decimals === 0 ? "1" : "0.01";
}

/**
 * Whether a typed amount has no more decimals than the currency allows. A string
 * check, not arithmetic: "15000.00" HUF is fine, "15000.5" isn't. Two-decimal
 * currencies are left to the input and the backend (they already enforce it).
 */
export function hasValidPrecision(amount: string, currency: CurrencyCode): boolean {
  return CURRENCIES[currency].decimals > 0 || /^\d+(\.0*)?$/.test(amount.trim());
}
