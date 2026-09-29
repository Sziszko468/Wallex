/**
 * The AI finance assistant (GET/POST /api/assistant/…). The server owns everything here: it
 * keeps the conversation history, runs the model and its data tools, and stores the answers.
 */

export type AssistantTool =
  | "get_monthly_spending"
  | "get_category_spending"
  | "get_merchant_spending"
  | "get_budget_status"
  | "get_subscription_costs"
  | "get_savings_progress"
  | "get_month_comparison";

/** Backend data an answer is based on, e.g. "Month comparison · September 2026 vs August 2026". */
export interface AssistantDataSource {
  tool: AssistantTool;
  label: string;
  detail: string | null;
}

export interface AssistantMessage {
  id: number;
  role: "user" | "assistant";
  /** Answers are plain text with light Markdown: `**bold**` and `- ` list items. */
  content: string;
  /** Empty for questions (and for answers not based on any data). */
  sources: AssistantDataSource[];
  created_at: string;
}

export interface AssistantConversationSummary {
  id: number;
  /** The first question, shortened. */
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AssistantConversation extends AssistantConversationSummary {
  /** Oldest first. */
  messages: AssistantMessage[];
}

/** POST answer: the question and the answer, both already stored. */
export interface AssistantExchange {
  conversation: AssistantConversationSummary;
  messages: [AssistantMessage, AssistantMessage];
}

export interface AssistantStatus {
  /** False when the server has no model API key. */
  available: boolean;
  /** Picked from the user's own data; empty when not available. */
  suggested_questions: string[];
  max_question_length: number;
}
