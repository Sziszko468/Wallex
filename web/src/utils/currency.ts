import { currentLocale } from "../i18n";
import type { CurrencyCode } from "../types/currency";

interface CurrencyInfo {
  /** Digits after the decimal point: 0 for forint and yen (whole numbers only). */
  decimals: number;
}

const DEFAULT_DECIMALS = 2;

/** Mirrors apps/currencies/models.py (Currency + DECIMALS). */
export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  EUR: { decimals: DEFAULT_DECIMALS },
  HUF: { decimals: 0 },
  USD: { decimals: DEFAULT_DECIMALS },
  GBP: { decimals: DEFAULT_DECIMALS },
  JPY: { decimals: 0 },
  CHF: { decimals: DEFAULT_DECIMALS },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value in CURRENCIES;
}

/** The currency's name in the interface language ("Hungarian forint", "magyar forint"). */
export function currencyName(currency: CurrencyCode): string {
  const name = new Intl.DisplayNames([currentLocale()], { type: "currency" }).of(currency) ?? currency;
  return name.charAt(0).toLocaleUpperCase(currentLocale()) + name.slice(1);
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
