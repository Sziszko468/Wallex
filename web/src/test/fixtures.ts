import type { User } from "../types/auth";
import type { Category } from "../types/category";
import type { Transaction } from "../types/transaction";
import type { CategoryAnalytics, DashboardStats, InsightsResponse, MonthlyAnalytics } from "../types/dashboard";

// Shapes copied from real API responses (docs/api-contract.md) — money as decimal strings.

export const user: User = {
  id: 1,
  email: "anna@example.com",
  first_name: "Anna",
  last_name: "Kovács",
  date_joined: "2026-09-01T10:00:00Z",
};

const timestamps = { created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" };

export const categories: Category[] = [
  { id: 10, name: "Food", type: "expense", color: "#16a34a", icon: "", is_system: true, ...timestamps },
  { id: 11, name: "Transport", type: "expense", color: "#2563eb", icon: "", is_system: true, ...timestamps },
  { id: 20, name: "Salary", type: "income", color: "#d97706", icon: "", is_system: true, ...timestamps },
];

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 100,
    amount: "12.50",
    type: "expense",
    category: 10,
    description: "Groceries",
    date: "2026-09-20",
    client_id: null,
    ...timestamps,
    ...overrides,
  };
}

export function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

export const emptyPage = page<Transaction>([]);

export const dashboard: DashboardStats = {
  year: 2026,
  month: 9,
  total_income: "3000.00",
  total_expenses: "1234.56",
  balance: "1765.44",
  transaction_count: 7,
  top_spending_category: { category_id: 10, category_name: "Food", amount: "800.00" },
  budget_usage: [
    {
      budget_id: 1,
      category_id: 10,
      category_name: "Food",
      budget_amount: "700.00",
      spent_amount: "800.00",
      remaining_amount: "-100.00",
      usage_percentage: 114.29,
    },
  ],
};

export const monthly: MonthlyAnalytics = {
  year: 2026,
  months: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    month_name: new Date(2026, index, 1).toLocaleString("en", { month: "long" }),
    income: "0.00",
    expenses: "0.00",
    balance: "0.00",
  })),
};

export const categoryBreakdown: CategoryAnalytics = {
  year: 2026,
  month: 9,
  categories: [{ category_id: 10, category_name: "Food", amount: "800.00", percentage: 64.8 }],
};

export const insights: InsightsResponse = {
  year: 2026,
  month: 9,
  insights: [
    {
      id: "budget_exceeded:1",
      type: "budget_exceeded",
      severity: "alert",
      message: "Food exceeded its budget by 14%.",
      category_id: 10,
      amount: "100.00",
      percentage: 114.29,
    },
  ],
};
