import type { CurrencyCode } from "./currency";
import type { RecurringFrequency } from "./recurringTransaction";

/** active: has payments ahead · paused: `active` is false · ended: past its end_date. */
export type SubscriptionStatus = "active" | "paused" | "ended";

/**
 * Shape of /api/subscriptions/. A subscription is a recurring expense on the server
 * (the same row as in /api/recurring-transactions/), so reminders and insights see it too.
 * Every cost, date and status below is computed by the backend — render as-is.
 */
export interface Subscription {
  id: number;
  name: string;
  merchant: string;
  /** Price of one payment, in `currency`, as billed. Decimal string. */
  amount: string;
  currency: CurrencyCode;
  category: number;
  frequency: RecurringFrequency;
  start_date: string;
  end_date: string | null;
  /** Next payment on or after today; null when paused or ended. */
  next_payment_date: string | null;
  active: boolean;
  status: SubscriptionStatus;
  /** The next few payment dates (empty when paused or ended). */
  upcoming_payments: string[];
  /** In `currency`. */
  monthly_cost: string;
  yearly_cost: string;
  /** In the user's base currency; null when no recent exchange rate exists. */
  base_monthly_cost: string | null;
  base_yearly_cost: string | null;
  description: string;
  created_at: string;
  updated_at: string;
}

/** Body for POST /api/subscriptions/. The type is always "expense" — the server sets it. */
export interface CreateSubscriptionPayload {
  name: string;
  merchant?: string;
  amount: string;
  currency?: CurrencyCode;
  category: number;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string | null;
  active?: boolean;
  description?: string;
}

export type UpdateSubscriptionPayload = Partial<CreateSubscriptionPayload>;

export interface SubscriptionCategoryCost {
  category_id: number;
  category_name: string;
  monthly_total: string;
  subscription_count: number;
  /** Share of the summary's monthly_total, 0–100. */
  percentage: number | null;
}

export interface UpcomingSubscriptionPayment {
  subscription_id: number;
  name: string;
  date: string;
  /** As billed, in `currency`. */
  amount: string;
  currency: CurrencyCode;
  /** In the base currency; null without a recent exchange rate. */
  base_amount: string | null;
}

/** Shape of GET /api/subscriptions/summary/ — totals in the base currency (`currency`). */
export interface SubscriptionSummary {
  currency: CurrencyCode;
  active_count: number;
  paused_count: number;
  ended_count: number;
  monthly_total: string;
  /** Yearly projection. */
  yearly_total: string;
  by_category: SubscriptionCategoryCost[];
  /** Payments due in the next 30 days, soonest first. */
  upcoming: UpcomingSubscriptionPayment[];
  /** Currencies without a recent rate — subscriptions billed in them are left out of the totals. */
  unconverted_currencies: CurrencyCode[];
}
