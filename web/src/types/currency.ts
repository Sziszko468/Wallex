/** ISO 4217 codes the API accepts — mirrors apps/currencies/models.py (Currency). */
export type CurrencyCode = "EUR" | "HUF" | "USD" | "GBP" | "JPY" | "CHF";

/** Query params of GET /api/currencies/convert/. */
export interface ConversionParams {
  /** Decimal string in `currency`, e.g. "15000". */
  amount: string;
  currency: CurrencyCode;
  /** ISO date; the backend defaults to today. */
  date?: string;
}

/**
 * Shape of GET /api/currencies/convert/ — the rate and base amount a transaction
 * would store, computed by the backend. Display only; nothing is saved.
 */
export interface ConversionPreview {
  amount: string;
  currency: CurrencyCode;
  base_currency: CurrencyCode;
  /** Value of 1 unit of `currency` in `base_currency`. */
  exchange_rate: string;
  base_amount: string;
  /** Date of the ECB publication used; null for the base currency itself. */
  rate_date: string | null;
}
