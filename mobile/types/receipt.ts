/** "low" = a best guess (or not found): the confirmation screen asks the user to check it. */
export type ScanConfidence = "high" | "low";

export interface ScannedField<T> {
  value: T | null;
  confidence: ScanConfidence;
}

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
  category: { id: number; name: string; source: "history" | "rules" } | null;
  /** false = the OCR found no text at all (blurry/dark photo). */
  text_found: boolean;
}
