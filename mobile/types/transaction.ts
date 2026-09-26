import type { TransactionType } from "./category";
import type { CurrencyCode } from "./currency";

export interface Transaction {
  id: number;
  /**
   * Decimal amount in `currency`, as paid — serialized by DRF as a STRING
   * (e.g. "49.99"), never a number. Never run financial math on it in the
   * client — the backend is the source of truth for every computed total;
   * this field is for display (and for round-tripping back into an update payload).
   */
  amount: string;
  currency: CurrencyCode;
  /** Value of 1 unit of `currency` in the user's base currency, fixed when saved. */
  exchange_rate: string;
  /** `amount` in the user's base currency, computed by the backend. Totals add these up. */
  base_amount: string;
  type: TransactionType;
  /** Category id — always one of the current user's own categories. */
  category: number;
  description: string;
  /** ISO date, "YYYY-MM-DD". */
  date: string;
  /** Set only for transactions that were recorded offline in the mobile app. */
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Body for POST /api/transactions/. id/created_at/updated_at are server-assigned. */
export interface CreateTransactionPayload {
  amount: string;
  /** Defaults to the user's base currency on the backend. */
  currency?: CurrencyCode;
  type: TransactionType;
  category: number;
  description?: string;
  date: string;
  /** Idempotency key for offline-recorded transactions (see services/outbox.ts). */
  client_id?: string;
}

export type UpdateTransactionPayload = Partial<Omit<CreateTransactionPayload, "client_id">>;

/** Query params accepted by GET /api/transactions/. */
export interface TransactionListParams {
  type?: TransactionType;
  category?: number;
  category_name?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}
