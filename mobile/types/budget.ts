export interface Budget {
  id: number;
  /** null = an "overall" budget spanning all categories for that month. */
  category: number | null;
  /** Decimal as string — see the note on Transaction.amount. */
  amount: string;
  year: number;
  /** 1-12. */
  month: number;
  /**
   * The following three fields are computed server-side from the user's
   * actual transactions for that category/month (see the analytics/budget
   * backend step) — never recompute them from a locally-cached transaction
   * list, and never sum transactions client-side to approximate them.
   */
  spent_amount: string;
  remaining_amount: string;
  usage_percentage: number;
  created_at: string;
  updated_at: string;
}
