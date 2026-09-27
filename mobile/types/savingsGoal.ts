import type { CurrencyCode } from "./currency";

/** active: still saving · completed: reached its target (set by the server) · archived: put away. */
export type SavingsGoalStatus = "active" | "completed" | "archived";

/**
 * Shape of /api/savings-goals/. Both amounts are in the goal's own `currency` and never
 * converted. Every figure below — progress, remaining, days left, monthly needed, base
 * values — is computed by the backend. Render as-is; never recompute on the client.
 */
export interface SavingsGoal {
  id: number;
  name: string;
  currency: CurrencyCode;
  /** Decimal strings, in `currency`. */
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  status: SavingsGoalStatus;
  /** 0–100+ (above 100 when over-saved); the bar is clamped for display only. */
  progress_percentage: number;
  remaining_amount: string;
  /** Days until target_date; negative once it has passed, null without one. */
  days_left: number | null;
  /** What to save per month to reach the target by target_date; null when there's nothing to plan. */
  monthly_needed: string | null;
  /** In the user's base currency; null without a recent exchange rate. */
  base_current_amount: string | null;
  base_target_amount: string | null;
  created_at: string;
  updated_at: string;
}

/** Body for POST /api/savings-goals/. */
export interface CreateSavingsGoalPayload {
  name: string;
  target_amount: string;
  /** Defaults to "0.00" on the server. */
  current_amount?: string;
  /** Defaults to the base currency; can only change while nothing is saved. */
  currency?: CurrencyCode;
  target_date?: string | null;
  /** "archived" archives the goal, "active" restores it ("completed" is set by the server). */
  status?: Exclude<SavingsGoalStatus, "completed">;
}

export type UpdateSavingsGoalPayload = Partial<CreateSavingsGoalPayload>;

/** Body for POST /api/savings-goals/{id}/deposit/ and /withdraw/ — in the goal's currency. */
export interface MoneyMovementPayload {
  amount: string;
}

/** Shape of GET /api/savings-goals/summary/ — totals in the base currency, archived goals excluded. */
export interface SavingsSummary {
  currency: CurrencyCode;
  active_count: number;
  completed_count: number;
  archived_count: number;
  total_saved: string;
  total_target: string;
  progress_percentage: number | null;
  /** Currencies without a recent rate — goals saved in them are left out of the totals. */
  unconverted_currencies: CurrencyCode[];
}
