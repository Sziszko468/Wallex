export const budgets = {
  title: "Budgets",
  description: "What you plan to spend, and how it's going.",
  overall: "Overall",
  emptyTitle: "No budgets for {{period}}",
  emptyMessage: "Budgets you set for a month appear here, with what you've spent and what's left.",
  status: {
    on_track: "On track",
    ahead_of_pace: "Ahead of pace",
    near_limit: "Near limit",
    over_budget: "Over budget",
  },
  row: {
    amounts: "{{spent}} of {{budget}}",
    used: "{{name}} budget used",
    over: "{{amount}} over",
    left: "{{amount}} left",
    usage: "{{percentage}} used",
    overBudget: "{{percentage}} over budget",
    underBudget: "{{percentage}} under budget",
  },
} as const;

export const categories = {
  title: "Categories",
  description: "How your spending is organised.",
  emptyTitle: "Custom categories are coming",
  emptyMessage:
    "Soon you'll be able to add and organise your own here. The default categories already work across your transactions and budgets.",
} as const;
