import type { TransactionType } from "./category";

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

export interface RecurringTransaction {
  id: number;
  name: string;
  category: number;
  type: TransactionType;
  /** Decimal as string — see the note on Transaction.amount. */
  amount: string;
  frequency: RecurringFrequency;
  start_date: string;
  end_date: string | null;
  /**
   * Computed server-side from start_date/frequency (see the backend
   * serializer) — never set this directly, and never recompute it
   * client-side. A future generation job is the only other thing that will
   * ever advance it.
   */
  next_occurrence_date: string;
  is_active: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

/** Body for POST /api/recurring-transactions/. next_occurrence_date is server-derived. */
export interface CreateRecurringTransactionPayload {
  name: string;
  category: number;
  type: TransactionType;
  amount: string;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string | null;
  is_active?: boolean;
  description?: string;
}

export type UpdateRecurringTransactionPayload = Partial<CreateRecurringTransactionPayload>;
