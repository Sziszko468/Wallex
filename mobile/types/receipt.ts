import type { CurrencyCode } from "./currency";

/** "low" = a best guess (or not found): the confirmation screen asks the user to check it. */
export type ScanConfidence = "high" | "low";

export interface ScannedField<T> {
  value: T | null;
  confidence: ScanConfidence;
}

/** A purchased line as read from the receipt — for display only; the total is never summed from these. */
export interface ReceiptItem {
  name: string;
  /** Decimal string, in the receipt's currency. */
  amount: string;
}

/**
 * complete: merchant, total, date and currency found · incomplete: a receipt with fields missing ·
 * unsupported: text, but no total and no date (not a receipt) · unreadable: no text at all.
 */
export type ScanOutcome = "complete" | "incomplete" | "unsupported" | "unreadable";

/**
 * Shape of POST /api/receipts/scan/ — a SUGGESTION only; nothing is saved
 * until the user confirms it and the app calls POST /api/transactions/.
 */
export interface ReceiptScan {
  merchant: ScannedField<string>;
  /** Decimal string, e.g. "2056.00". */
  amount: ScannedField<string>;
  /** ISO date, "YYYY-MM-DD". */
  date: ScannedField<string>;
  /** A supported currency printed on the receipt; null if none was found. */
  currency: ScannedField<CurrencyCode>;
  /** A currency on the receipt WALLEX can't record (e.g. "CZK"); null otherwise. */
  unsupported_currency: string | null;
  items: ReceiptItem[];
  category: { id: number; name: string; source: "history" | "rules" } | null;
  /** false = the OCR found no text at all (blurry/dark photo). */
  text_found: boolean;
  outcome: ScanOutcome;
}
