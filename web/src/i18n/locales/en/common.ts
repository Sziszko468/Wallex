export const common = {
  actions: {
    cancel: "Cancel",
    close: "Close",
    confirm: "Confirm",
    delete: "Delete",
    dismiss: "Dismiss",
    edit: "Edit",
    next: "Next",
    previous: "Previous",
    retry: "Retry",
    logOut: "Log out",
  },
  states: {
    loading: "Loading…",
    checkingSession: "Checking your session…",
    loadFailedTitle: "We couldn't load this",
    somethingWentWrong: "Something went wrong.",
    notAvailable: "—",
  },
  transactionType: {
    label: "Transaction type",
    expense: "Expense",
    income: "Income",
  },
  month: {
    previous: "Previous month",
    next: "Next month",
  },
  pagination: {
    label: "Transactions pagination",
    status: "Page {{page}} of {{totalPages}} · {{totalCount}} total",
  },
  theme: {
    label: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
  },
  language: {
    label: "Language",
  },
  currency: {
    label: "Currency",
  },
  labels: {
    balance: "Balance",
    category: "Category",
    change: "Change",
    expenses: "Expenses",
    income: "Income",
    status: "Status",
  },
  form: {
    amount: "Amount",
    category: "Category",
    selectCategory: "Select a category",
    date: "Date",
    descriptionOptional: "Description (optional)",
    name: "Name",
  },
  validation: {
    amountRequired: "Amount is required.",
    amountPositive: "Amount must be greater than 0.",
    noDecimals: "{{currency}} amounts can't have decimals.",
    categoryRequired: "Choose a category.",
    dateRequired: "Date is required.",
    nameRequired: "Name is required.",
  },
  item: {
    edit: "Edit {{name}}",
    delete: "Delete {{name}}",
  },
  confirm: {
    deleteMessage: "Delete \"{{name}}\"? This can't be undone.",
  },
  dates: {
    today: "Today",
    yesterday: "Yesterday",
  },
  skipToContent: "Skip to main content",
  metaDescription: "{{appName}} — a calm way to see where your money goes.",
} as const;
