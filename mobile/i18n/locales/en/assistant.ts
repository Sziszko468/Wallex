export const assistant = {
  welcome: "What would you like to know about your money?",
  description:
    "Ask about your spending, budgets, subscriptions and savings goals. Answers are based only on your {{appName}} data.",
  notConfigured: "The AI assistant isn't set up on this server yet.",
  offline: "You're offline — the assistant needs a connection.",
  gone: "This conversation no longer exists — it may have been deleted on another device.",
  toolbar: {
    history: "History",
    historyLabel: "Conversation history",
    newChat: "New chat",
  },
  composer: {
    label: "Ask about your finances",
    placeholder: "Ask about your spending…",
    send: "Send",
  },
  messages: {
    you: "You: {{text}}",
    basedOn: "Based on",
    basedOnLabel: "Based on:",
    thinking: "Checking your data",
    thinkingText: "Checking your data…",
  },
  suggestions: {
    label: "Suggested questions",
    heading: "Try asking",
  },
  history: {
    title: "Conversations",
    empty: "Your conversations will appear here.",
    open: "Open conversation: {{title}}",
    delete: "Delete conversation: {{title}}",
    deleteTitle: "Delete conversation?",
    deleteMessage: "\"{{title}}\" and its messages will be deleted on all your devices.",
    today: "Today, {{time}}",
  },
  errors: {
    timeout: "The answer took too long. Please try again.",
    rateLimited: "You've asked a lot of questions in a short time. Please wait a little and try again.",
    offline: "You're offline. The assistant needs a connection to look at your data.",
  },
} as const;
