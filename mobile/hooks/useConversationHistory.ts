import { useCallback, useEffect, useRef, useState } from "react";
import { listConversations } from "../services/assistantService";
import type { AssistantConversationSummary } from "../types/assistant";

interface HistoryState {
  conversations: AssistantConversationSummary[];
  isLoading: boolean;
  error: unknown;
  /** The next page to load; null when everything is loaded. */
  nextPage: number | null;
  isLoadingMore: boolean;
}

/** The assistant's conversation history, most recently active first, a page at a time. */
export function useConversationHistory() {
  const [state, setState] = useState<HistoryState>({
    conversations: [],
    isLoading: true,
    error: null,
    nextPage: null,
    isLoadingMore: false,
  });
  const requestIdRef = useRef(0);

  /** Loads the first page; answers of an older call that return late are ignored. */
  const loadFirstPage = useCallback(() => {
    const requestId = ++requestIdRef.current;
    listConversations(1)
      .then((page) => {
        if (requestIdRef.current !== requestId) return;
        setState({ conversations: page.results, isLoading: false, error: null, nextPage: page.next ? 2 : null, isLoadingMore: false });
      })
      .catch((error: unknown) => {
        if (requestIdRef.current === requestId) setState((previous) => ({ ...previous, isLoading: false, error }));
      });
  }, []);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const refetch = useCallback(() => {
    // Reloading a list already on screen keeps it there until the new page arrives.
    setState((previous) => ({ ...previous, isLoading: previous.conversations.length === 0, error: null }));
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(() => {
    const page = state.nextPage;
    if (page === null || state.isLoadingMore) return;
    const requestId = requestIdRef.current;
    setState((previous) => ({ ...previous, isLoadingMore: true }));
    listConversations(page)
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setState((previous) => {
          const known = new Set(previous.conversations.map((conversation) => conversation.id));
          return {
            ...previous,
            conversations: [...previous.conversations, ...result.results.filter((conversation) => !known.has(conversation.id))],
            nextPage: result.next ? page + 1 : null,
            isLoadingMore: false,
          };
        });
      })
      .catch(() => {
        if (requestIdRef.current === requestId) setState((previous) => ({ ...previous, isLoadingMore: false }));
      });
  }, [state.nextPage, state.isLoadingMore]);

  /** Just asked in it: (back) at the top of the list. */
  const moveToTop = useCallback((conversation: AssistantConversationSummary) => {
    setState((previous) => ({
      ...previous,
      conversations: [conversation, ...previous.conversations.filter((item) => item.id !== conversation.id)],
    }));
  }, []);

  const remove = useCallback((id: number) => {
    setState((previous) => ({ ...previous, conversations: previous.conversations.filter((item) => item.id !== id) }));
  }, []);

  return { ...state, refetch, loadMore, moveToTop, remove };
}
