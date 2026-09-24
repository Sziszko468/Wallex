import type { TransactionType } from "./category";

export interface Transaction {
  id: number;
  /**
   * Decimal amount, serialized by DRF as a STRING (e.g. "49.99"), never a
   * number. Never run financial math on it in the client — the backend is
   * the source of truth for every computed total; this field is for
   * display (and for round-tripping back into an update payload).
   */
  amount: string;
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
