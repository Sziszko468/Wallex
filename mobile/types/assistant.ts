import type { CurrencyCode } from "./currency";

/**
 * The AI finance assistant (GET/POST /api/assistant/…). The server owns everything here: it
 * keeps the conversation history, runs the model (Gemini or Claude — the apps never know which)
 * and its data tools, and stores the answers. The model's API key never leaves the server.
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

export type AssistantInsightType =
  | "total_spending"
  | "largest_category"
  | "category_spending"
  | "top_merchant"
  | "spending_change"
  | "spending_change_year"
  | "biggest_increase"
  | "over_budget"
  | "closest_budget"
  | "subscriptions_cost"
  | "goal_progress";

/**
 * A card with a key figure of an answer. The backend computes it from the same figures the
 * answer rests on (never the model) and writes `label` / `detail` in the user's language.
 */
export interface AssistantInsight {
  type: AssistantInsightType;
  /** What the card is about, e.g. "Largest category". */
  label: string;
  /** Which category, goal or period, e.g. "Food"; null when there is nothing to add. */
  detail: string | null;
  /** The main amount as a decimal string in `currency` (signed for changes); null for percentage-only cards. */
  amount: string | null;
  currency: CurrencyCode | null;
  /** A share, change or progress in percent — what it means depends on `type`; null when unknown. */
  percentage: number | null;
  /** Colour is never the only signal: the card also shows an icon and text for non-neutral tones. */
  tone: "neutral" | "positive" | "warning";
}

export interface AssistantMessage {
  id: number;
  role: "user" | "assistant";
  /** Answers are plain text with light Markdown: `**bold**` and `- ` list items. */
  content: string;
  /** Empty for questions (and for answers not based on any data). */
  sources: AssistantDataSource[];
  /** Answers: up to 3 key-figure cards; empty for questions and answers without data. */
  insights: AssistantInsight[];
  /** Answers: follow-up questions to offer — show them under the latest answer only. */
  suggested_questions: string[];
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

/** What an answer cost in model tokens (all calls of the answer together; not stored). */
export interface AssistantUsage {
  input_tokens: number;
  output_tokens: number;
}

/** POST answer: the question and the answer, both already stored. */
export interface AssistantExchange {
  conversation: AssistantConversationSummary;
  messages: [AssistantMessage, AssistantMessage];
  usage: AssistantUsage;
}

export interface AssistantStatus {
  /** False when the server has no API key for its AI provider. */
  available: boolean;
  /** Picked from the user's own data; empty when not available. */
  suggested_questions: string[];
  max_question_length: number;
}
