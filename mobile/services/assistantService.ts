import { apiClient } from "./apiClient";
import type { PaginatedResponse } from "../types/api";
import type {
  AssistantConversation,
  AssistantConversationSummary,
  AssistantExchange,
  AssistantStatus,
} from "../types/assistant";

/**
 * An answer can take up to ~90 s on the server (the model may look up data several times),
 * so asking waits longer than that before giving up.
 */
export const ASK_TIMEOUT_MS = 120_000;

export async function getAssistantStatus(): Promise<AssistantStatus> {
  const response = await apiClient.get<AssistantStatus>("/assistant/");
  return response.data;
}

/** The conversation history, most recently active first. */
export async function listConversations(page = 1): Promise<PaginatedResponse<AssistantConversationSummary>> {
  const response = await apiClient.get<PaginatedResponse<AssistantConversationSummary>>("/assistant/conversations/", {
    params: { page },
  });
  return response.data;
}

export async function getConversation(id: number): Promise<AssistantConversation> {
  const response = await apiClient.get<AssistantConversation>(`/assistant/conversations/${id}/`);
  return response.data;
}

/** Asks the first question of a new conversation. */
export async function startConversation(message: string): Promise<AssistantExchange> {
  const response = await apiClient.post<AssistantExchange>(
    "/assistant/conversations/",
    { message },
    { timeout: ASK_TIMEOUT_MS }
  );
  return response.data;
}

/** Asks a follow-up question; the server sends the earlier messages to the model as context. */
export async function askInConversation(id: number, message: string): Promise<AssistantExchange> {
  const response = await apiClient.post<AssistantExchange>(
    `/assistant/conversations/${id}/messages/`,
    { message },
    { timeout: ASK_TIMEOUT_MS }
  );
  return response.data;
}

export async function deleteConversation(id: number): Promise<void> {
  await apiClient.delete(`/assistant/conversations/${id}/`);
}
