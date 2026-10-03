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

/** Every currency the API accepts, in picker order. */
export const CURRENCY_CODES = Object.keys(CURRENCY_DECIMALS) as CurrencyCode[];

/**
 * The text of an amount field as the API wants it. A Hungarian phone's number pad has a decimal
 * comma and people group digits with spaces: "1 250,50" becomes "1250.50". Only a comma without a
 * dot is read as the decimal mark; anything else ("1,250.50") is left alone and fails validation
 * instead of being guessed at.
 */
export function normalizeAmountInput(text: string): string {
  const compact = text.replace(/[\s\u00a0]/g, "");
  return compact.includes(",") && !compact.includes(".") ? compact.replace(",", ".") : compact;
}

/**
 * Whether a typed amount has no more decimals than the currency allows. A string
 * check, not arithmetic: "15000.00" HUF is fine, "15000.5" isn't. Two-decimal
 * currencies are left to the backend, which already enforces them.
 */
export function hasValidPrecision(amount: string, currency: CurrencyCode): boolean {
  return CURRENCY_DECIMALS[currency] > 0 || /^\d+(\.0*)?$/.test(amount.trim());
}
