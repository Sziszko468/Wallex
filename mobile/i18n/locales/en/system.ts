export const tabs = {
  dashboard: "Dashboard",
  assistant: "Assistant",
  transactions: "Transactions",
  recurring: "Recurring",
  budgets: "Budgets",
  settings: "Settings",
} as const;

export const screens = {
  addTransaction: "Add transaction",
  editTransaction: "Edit transaction",
  transactionDetails: "Transaction details",
  addRecurring: "Add recurring transaction",
  editRecurring: "Edit recurring transaction",
  scanReceipt: "Scan receipt",
  notifications: "Notifications",
} as const;

export const offline = {
  banner: {
    offline: "You're offline. {{saved}}{{waiting}}",
    savedAt: "Showing data saved {{time}}.",
    savedGeneric: "Showing saved data.",
    waiting_one: " {{count}} transaction will sync when you're back online.",
    waiting_other: " {{count}} transactions will sync when you're back online.",
    failed_one: "{{count}} transaction couldn't be synced.",
    failed_other: "{{count}} transactions couldn't be synced.",
    syncing_one: "Syncing {{count}} transaction…",
    syncing_other: "Syncing {{count}} transactions…",
    pending_one: "{{count}} transaction waiting to sync.",
    pending_other: "{{count}} transactions waiting to sync.",
    review: "Review",
    syncNow: "Sync now",
  },
  categoryGone:
    "Its category no longer exists (it was deleted or changed meanwhile). Discard it and add it again with another category.",
} as const;

export const errors = {
  network: "Network error — please check your connection and try again.",
  generic: "Something went wrong. Please try again.",
  timeout: "The server took too long to respond. Please try again.",
  sessionExpired: "Your session has expired. Please sign in again.",
  signedOut: "You have been signed out.",
  secureStorage: "{{appName}} couldn't access this device's secure storage. Please try again.",
} as const;
