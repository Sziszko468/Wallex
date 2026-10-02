export const recurring = {
  title: "Recurring transactions",
  description: "Income and payments that repeat on a schedule.",
  add: "Add recurring transaction",
  listLabel: "Recurring transactions",
  subscriptionBadge: "Subscription",
  paused: "Paused",
  next: "Next {{date}}",
  pause: "Pause {{name}}",
  resume: "Resume {{name}}",
  toast: {
    saved: "Changes saved",
    added: "Recurring transaction added",
    deleted: "Recurring transaction deleted",
  },
  empty: {
    title: "No recurring transactions yet",
    message: "Add rent, your salary or regular bills to keep track of everything that repeats.",
  },
  delete: {
    title: "Delete recurring transaction",
  },
  frequency: {
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
  },
  // The billing period of one payment: "€17.99 / month".
  period: {
    weekly: "week",
    monthly: "month",
    yearly: "year",
  },
  form: {
    addTitle: "Add recurring transaction",
    editTitle: "Edit recurring transaction",
    namePlaceholder: "e.g. Rent, Netflix, Spotify",
    frequency: "Frequency",
    startDate: "Start date",
    endDate: "End date (optional)",
    descriptionPlaceholder: "e.g. Apartment on Main St.",
    active: "Active",
    activeHint: "Paused items get no payment reminders.",
    submitAdd: "Add recurring transaction",
    submitSave: "Save changes",
    errors: {
      startRequired: "Start date is required.",
      endBeforeStart: "End date must be on or after the start date.",
    },
  },
} as const;
