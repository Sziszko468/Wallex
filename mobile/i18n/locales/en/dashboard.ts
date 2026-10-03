export const dashboard = {
  greeting: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  },
  account: "Account and settings",
  askAssistant: "Ask the assistant",
  summary: {
    balance: "Balance",
    income: "Income",
    expenses: "Expenses",
    count_one: "{{count}} transaction this month",
    count_other: "{{count}} transactions this month",
  },
  firstRun: {
    title: "No transactions yet",
    message: "Add your first transaction and {{appName}} will start building your financial overview.",
    action: "Add transaction",
  },
  insights: {
    title: "Insights",
    empty: "No insights for this month yet.",
    showMore_one: "Show {{count}} more",
    showMore_other: "Show {{count}} more",
    showLess: "Show less",
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
  spending: {
    title: "Where it went",
    seeAnalytics: "Analytics",
    empty: "No expenses yet this month.",
    share: "{{percentage}} of expenses",
    barLabel: "Spending by category",
  },
  budgets: {
    title: "Budgets",
    viewAll: "View all",
  },
  recent: {
    title: "Recent",
    viewAll: "View all",
    empty: "No transactions yet.",
  },
} as const;

export const budgets = {
  empty: "No budgets set for this month.",
  overall: "Overall",
  byCategory: "By category",
  amounts: "{{spent}} of {{budget}}",
  used: "{{percentage}} used",
  over: "Over by {{amount}}",
  left: "{{amount}} left",
  status: {
    onTrack: "On track",
    nearLimit: "Near limit",
    over: "Over budget",
  },
} as const;

export const analytics = {
  title: "Analytics",
  months: {
    title: "Income and expenses",
    income: "Income",
    expenses: "Expenses",
    column: "{{month}}: income {{income}}, expenses {{expenses}}",
    hint: "Tap a month to see its figures.",
  },
  categories: {
    title: "Spending by category",
    total: "Total spent",
    empty: "No expenses in this month.",
    share: "{{percentage}} of expenses",
  },
} as const;
