import axios from "axios";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { askInConversation, getConversation, startConversation } from "../services/assistantService";
import type { AssistantExchange, AssistantMessage } from "../types/assistant";
import { extractErrorMessage } from "../utils/errors";
import { isOfflineError } from "../utils/network";

interface ChatState {
  messages: AssistantMessage[];
  /** Loading an existing conversation. */
  isLoading: boolean;
  loadError: unknown;
  /** The question waiting for its answer (shown right away, with a "thinking" indicator). */
  pendingQuestion: string | null;
  sendError: string | null;
}

const EMPTY: ChatState = { messages: [], isLoading: false, loadError: null, pendingQuestion: null, sendError: null };

/** What happened to a question: answered, failed (the user is still here to retry), or the user opened another chat meanwhile. */
export type SendOutcome = "answered" | "failed" | "left";

/** A message safe to show when asking failed. */
export function askErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED") return "The answer took too long. Please try again.";
    if (error.response?.status === 429) {
      return "You've asked a lot of questions in a short time. Please wait a little and try again.";
    }
  }
  if (isOfflineError(error)) return "You're offline. The assistant needs a connection to look at your data.";
  return extractErrorMessage(error);
}

/**
 * One chat with the assistant. `conversationId` null = a new conversation, created by its first
 * question; `onAnswered` then gets `isNew: true` (e.g. to put its id in the URL — which this hook
 * recognizes, so the messages it already has aren't loaded again).
 */
export function useAssistantChat(
  conversationId: number | null,
  onAnswered: (exchange: AssistantExchange, isNew: boolean) => void
) {
  const [state, setState] = useState<ChatState>(EMPTY);
  // The conversation this state belongs to. Differs from `conversationId` right after a new
  // conversation got its id, until the caller shows it.
  const shownIdRef = useRef<number | null | undefined>(undefined);
  const onAnsweredRef = useRef(onAnswered);
  useLayoutEffect(() => {
    onAnsweredRef.current = onAnswered;
  });

  const load = useCallback((id: number | null) => {
    shownIdRef.current = id;
    if (id === null) {
      setState(EMPTY);
      return;
    }
    setState({ ...EMPTY, isLoading: true });
    getConversation(id)
      .then((conversation) => {
        if (shownIdRef.current === id) setState({ ...EMPTY, messages: conversation.messages });
      })
      .catch((error: unknown) => {
        if (shownIdRef.current === id) setState({ ...EMPTY, loadError: error });
      });
  }, []);

  useEffect(() => {
    if (conversationId !== shownIdRef.current) load(conversationId);
  }, [conversationId, load]);

  const send = useCallback(async (text: string): Promise<SendOutcome> => {
    const question = text.trim();
    const askedIn = shownIdRef.current ?? null;
    setState((previous) => ({ ...previous, pendingQuestion: question, sendError: null }));
    try {
      const exchange =
        askedIn === null ? await startConversation(question) : await askInConversation(askedIn, question);
      const stillHere = shownIdRef.current === askedIn;
      if (stillHere) {
        shownIdRef.current = exchange.conversation.id;
        setState((previous) => ({
          ...previous,
          messages: [...previous.messages, ...exchange.messages],
          pendingQuestion: null,
        }));
      }
      onAnsweredRef.current(exchange, askedIn === null && stillHere);
      return stillHere ? "answered" : "left";
    } catch (error) {
      if (shownIdRef.current !== askedIn) return "left";
      setState((previous) => ({ ...previous, pendingQuestion: null, sendError: askErrorMessage(error) }));
      return "failed";
    }
  }, []);

  const reload = useCallback(() => load(shownIdRef.current ?? null), [load]);

  return { ...state, isAsking: state.pendingQuestion !== null, send, reload };
}
