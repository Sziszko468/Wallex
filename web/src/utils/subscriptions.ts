import type { RecurringFrequency } from "../types/recurringTransaction";
import type { SubscriptionStatus } from "../types/subscription";

/** "€17.99 / month" — the billing period of one payment. */
export const PERIOD_LABELS: Record<RecurringFrequency, string> = {
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};
