/** Shared with Transaction/Budget — a category is either an income or an expense bucket. */
export type TransactionType = "income" | "expense";

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  /** System-seeded default category (Food, Salary, ...) — read-only, can't be edited or deleted. */
  is_system: boolean;
  created_at: string;
  updated_at: string;
}
