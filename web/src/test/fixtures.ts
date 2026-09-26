import type { User } from "../types/auth";
import type { Category } from "../types/category";
import type { Transaction } from "../types/transaction";
import type {
  CategoryAnalytics,
  Comparison,
  DashboardStats,
  InsightsResponse,
  Merchants,
  MonthlyAnalytics,
  SpendingPatterns,
  Trends,
} from "../types/dashboard";
import type { ConversionPreview } from "../types/currency";

// Shapes copied from real API responses (docs/api-contract.md) — money as decimal strings.

export const user: User = {
  id: 1,
  email: "anna@example.com",
  first_name: "Anna",
  last_name: "Kovács",
  date_joined: "2026-09-01T10:00:00Z",
  base_currency: "EUR",
};

const timestamps = { created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" };

export const categories: Category[] = [
  { id: 10, name: "Food", type: "expense", color: "#16a34a", icon: "", is_system: true, ...timestamps },
  { id: 11, name: "Transport", type: "expense", color: "#2563eb", icon: "", is_system: true, ...timestamps },
  { id: 20, name: "Salary", type: "income", color: "#d97706", icon: "", is_system: true, ...timestamps },
];

/** A euro transaction unless overridden; `base_amount` follows `amount` like the API does for the base currency. */
export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const amount = overrides.amount ?? "12.50";
  return {
    id: 100,
    amount,
    currency: "EUR",
    exchange_rate: "1.0000000000",
    base_amount: amount,
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
      variance_percentage: 14.29,
      expected_to_date: "466.67",
      status: "over_budget",
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

/** GET /api/currencies/convert/?amount=15000&currency=HUF — real ECB rate of 2026-09-25 (1 EUR = 389.85 HUF). */
export const conversionPreview: ConversionPreview = {
  amount: "15000.00",
  currency: "HUF",
  base_currency: "EUR",
  exchange_rate: "0.0025650891",
  base_amount: "38.48",
  rate_date: "2026-09-25",
};

/** GET /api/analytics/trends/?months=2 — Food: August 280.00, September 320.00, +14.29 %. */
export const trends: Trends = {
  year: 2026,
  month: 9,
  months: [
    { year: 2026, month: 8, month_name: "August", income: "3000.00", expenses: "1920.00", balance: "1080.00", expenses_change_percentage: 3.78 },
    { year: 2026, month: 9, month_name: "September", income: "3000.00", expenses: "2100.00", balance: "900.00", expenses_change_percentage: 9.38 },
  ],
  average_monthly_expenses: "2010.00",
  categories: [
    { category_id: 10, category_name: "Food", amounts: ["280.00", "320.00"], total: "600.00", average: "300.00", change_amount: "40.00", change_percentage: 14.29 },
  ],
};

const summary = { total_income: "2800.00", transaction_count: 7 };

export const comparison: Comparison = {
  against: "previous_month",
  current_month: { year: 2026, month: 9, ...summary, total_expenses: "2100.00", balance: "900.00" },
  previous_month: { year: 2026, month: 8, ...summary, total_expenses: "1920.00", balance: "1080.00" },
  difference: { total_income: "0.00", total_expenses: "180.00", balance: "-180.00" },
  percentage_difference: { total_income: 0, total_expenses: 9.38, balance: -16.67 },
  categories: [
    { category_id: 10, category_name: "Food", current_amount: "320.00", previous_amount: "280.00", change_amount: "40.00", change_percentage: 14.29 },
  ],
};

export const merchants: Merchants = {
  year: 2026,
  month: 9,
  total_expenses: "2100.00",
  merchants: [
    { merchant: "Albert Heijn", transaction_count: 6, total: "420.00", average: "70.00", share_percentage: 20, previous_total: "380.00", change_percentage: 10.53, last_date: "2026-09-24" },
    { merchant: "Jumbo", transaction_count: 3, total: "210.00", average: "70.00", share_percentage: 10, previous_total: "0.00", change_percentage: null, last_date: "2026-09-20" },
  ],
};

export const spendingPatterns: SpendingPatterns = {
  year: 2026,
  month: 9,
  days_counted: 30,
  total_expenses: "2100.00",
  average_daily_spending: "70.00",
  weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((name, index) => ({
    weekday: index + 1,
    name,
    total: "300.00",
    transaction_count: 3,
    days: 4,
    average_per_day: "75.00",
  })),
  fixed_expenses: "600.00",
  variable_expenses: "1500.00",
  fixed_percentage: 28.57,
  recurring_commitments: "650.00",
};
