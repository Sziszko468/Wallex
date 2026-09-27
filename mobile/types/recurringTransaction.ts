import type { TransactionType } from "./category";
import type { CurrencyCode } from "./currency";

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

export interface RecurringTransaction {
  id: number;
  name: string;
  category: number;
  type: TransactionType;
  /** Decimal as string, in `currency` (as billed — never converted). */
  amount: string;
  currency: CurrencyCode;
  merchant: string;
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
  /** Created through /api/subscriptions/ (a subscription is a recurring expense). */
  is_subscription: boolean;
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
  /** Defaults to the base currency on the server. */
  currency?: CurrencyCode;
  merchant?: string;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string | null;
  is_active?: boolean;
  description?: string;
}

export type UpdateRecurringTransactionPayload = Partial<CreateRecurringTransactionPayload>;
