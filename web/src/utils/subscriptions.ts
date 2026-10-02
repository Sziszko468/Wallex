import { t } from "i18next";
import type { RecurringFrequency } from "../types/recurringTransaction";
import type { SubscriptionStatus } from "../types/subscription";

/** "week" / "month" / "year" — the billing period of one payment ("€17.99 / month"). */
export function periodLabel(frequency: RecurringFrequency): string {
  return t(`recurring.period.${frequency}`);
}

/** "Weekly" / "Monthly" / "Yearly". */
export function frequencyLabel(frequency: RecurringFrequency): string {
  return t(`recurring.frequency.${frequency}`);
}

/** "Active" / "Paused" / "Ended". */
export function statusLabel(status: SubscriptionStatus): string {
  return t(`subscriptions.status.${status}`);
}
