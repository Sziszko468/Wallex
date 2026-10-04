export const assistant = {
  title: "AI Assistant",
  description:
    "Ask about your spending, budgets, subscriptions and savings goals. Answers are based only on your {{appName}} data.",
  history: "History",
  hideHistory: "Hide history",
  newChat: "New chat",
  loadingConversation: "Loading conversation",
  gone: "This conversation no longer exists — it may have been deleted on another device.",
  startNew: "Start a new chat",
  welcome: "What would you like to know about your money?",
  chat: "Chat",
  notConfigured:
    "The AI assistant isn't set up on this server yet: it needs an API key for its AI provider (see docs/ai-assistant.md).",
  disclaimer:
    "The assistant only reads your data — it can't change anything. It can make mistakes, so check important figures in the app.",
  deleteDialog: {
    title: "Delete conversation?",
    message: "\"{{title}}\" and its messages will be deleted on all your devices. This can't be undone.",
  },
  composer: {
    label: "Ask about your finances",
    placeholder: "e.g. Where did I spend more than last month?",
    send: "Send",
  },
  messages: {
    basedOn: "Based on",
    conversation: "Conversation",
    you: "You",
    assistant: "Assistant",
    thinking: "Checking your data",
    insights: "Key figures",
    followUps: "You could also ask",
  },
  insights: {
    tone: {
      warning: "Needs attention",
      positive: "Good news",
    },
    // What the percentage on a card is a percentage of.
    meaning: {
      total_spending: "of expenses",
      largest_category: "of expenses",
      category_spending: "of expenses",
      top_merchant: "of expenses",
      spending_change: "change",
      spending_change_year: "change",
      biggest_increase: "change",
      over_budget: "used",
      closest_budget: "used",
      subscriptions_cost: "of expenses",
      goal_progress: "reached",
    },
  },
  suggestions: {
    label: "Suggested questions",
    heading: "Try asking",
  },
  list: {
    label: "Conversation history",
    empty: "Your conversations will appear here.",
    delete: "Delete conversation: {{title}}",
    showOlder: "Show older",
    today: "Today, {{time}}",
  },
  errors: {
    timeout: "The answer took too long. Please try again.",
    rateLimited: "You've asked a lot of questions in a short time. Please wait a little and try again.",
  },
} as const;

export const importCsv = {
  title: "Import transactions",
  description: "Bring in a CSV file from your bank or another app.",
  uploadTitle: "Upload a CSV file",
  help:
    "Expected columns: <code>date</code>, <code>description</code>, <code>amount</code>. Dates as <code>YYYY-MM-DD</code> or <code>DD/MM/YYYY</code>. Amount is signed — negative for expenses, positive for income (e.g. <code>-42.50</code>), in your base currency ({{currency}}). Categories are detected automatically from the description (e.g. \"Albert Heijn\" → Food, \"Shell\" → Transport, \"Netflix\" → Entertainment); an unmatched expense falls back to \"Other\". Exports from Hungarian banks work as they are: <code>Dátum</code>, <code>Közlemény</code>, <code>Összeg</code> columns, separated by semicolons, with a decimal comma (<code>-12 345,67</code>) and dates like <code>2026.09.10.</code>.",
  notCsv: "That doesn't look like a CSV file. Choose a file ending in .csv.",
  imported_one: "{{count}} transaction imported",
  imported_other: "{{count}} transactions imported",
  choose: "Choose CSV file",
  ready: "Ready to import",
  dragHint: "or drag and drop it here",
  submit: "Import",
  resultTitle: "Import result",
  result: {
    imported: "Imported",
    skipped: "Skipped",
    failed: "Failed",
    row: "Row",
    reason: "Reason",
  },
} as const;
