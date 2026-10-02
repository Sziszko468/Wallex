export const dashboard = {
  greeting: "Hi",
  greetingWithName: "Hi, {{name}}",
  addTransaction: "Add transaction",
  cards: {
    overview: "Overview",
    insights: "Insights",
    monthly: "Monthly spending",
    topCategories: "Top categories",
    recent: "Recent transactions",
    budgetStatus: "Budget status",
  },
  summary: {
    balance: "Balance",
    income: "↑ Income",
    expenses: "↓ Expenses",
    count_one: "{{count}} transaction this month",
    count_other: "{{count}} transactions this month",
  },
  insights: {
    empty: "No insights for this month yet.",
    // What the backend-computed amount means for each insight type.
    amount: {
      top_category: "{{amount}} spent",
      category_increase: "{{amount}} more",
      category_decrease: "{{amount}} less",
      budget_exceeded: "{{amount}} over budget",
      budget_warning: "{{amount}} left",
      recurring_share: "{{amount}} recurring per month",
      overspending: "{{amount}} more than earned",
      savings: "{{amount}} saved",
    },
  },
  topCategories: {
    empty: "No expenses yet this month.",
    share: "{{percentage}} of expenses",
  },
  recent: {
    empty: "No transactions yet.",
  },
  trend: {
    income: "Income",
    expenses: "Expenses",
    column: "{{month}}: income {{income}}, expenses {{expenses}}",
  },
  budgetStatus: {
    empty: "No budgets set for this month.",
    overall: "Overall",
    over: "Over budget by {{amount}}",
    left: "{{amount}} left · {{percentage}}",
  },
} as const;

export const budgets = {
  empty: "No budgets set for this month.",
  overall: "Overall",
  used: "{{percentage}} used",
  over: "Over by {{amount}}",
  left: "{{amount}} left",
  overBudget: "⚠ Over budget for this month",
} as const;
