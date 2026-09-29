import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteConversation, getAssistantStatus } from "../services/assistantService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useAssistantChat } from "../hooks/useAssistantChat";
import { useConversationHistory } from "../hooks/useConversationHistory";
import type { AssistantConversationSummary, AssistantExchange } from "../types/assistant";
import { extractErrorMessage, isNotFound } from "../utils/errors";
import { ChatComposer } from "../components/assistant/ChatComposer";
import { ChatMessages } from "../components/assistant/ChatMessages";
import { ConversationList } from "../components/assistant/ConversationList";
import { SuggestedQuestions } from "../components/assistant/SuggestedQuestions";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBanner } from "../components/ErrorBanner";
import { ErrorState } from "../components/ErrorState";
import { Skeleton } from "../components/Skeleton";
import styles from "./AssistantPage.module.scss";

const DEFAULT_MAX_LENGTH = 1000;

function parseConversationId(param: string | undefined): number | null {
  const id = Number(param);
  return param !== undefined && Number.isInteger(id) && id > 0 ? id : null;
}

/** /assistant — a new chat; /assistant/:conversationId — a conversation from the history. */
export function AssistantPage() {
  const { conversationId } = useParams();
  const activeId = parseConversationId(conversationId);
  const navigate = useNavigate();

  const fetchStatus = useCallback(() => getAssistantStatus(), []);
  const status = useAsyncData(fetchStatus, { live: false });
  const history = useConversationHistory();
  const { moveToTop, remove } = history;

  const [draft, setDraft] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AssistantConversationSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleAnswered = useCallback(
    (exchange: AssistantExchange, isNew: boolean) => {
      moveToTop(exchange.conversation);
      if (isNew) navigate(`/assistant/${exchange.conversation.id}`);
    },
    [moveToTop, navigate]
  );
  const chat = useAssistantChat(activeId, handleAnswered);

  useEffect(() => {
    if (conversationId !== undefined && activeId === null) navigate("/assistant", { replace: true });
  }, [conversationId, activeId, navigate]);

  async function ask(question: string) {
    setDraft("");
    const outcome = await chat.send(question);
    // Not sent: the question goes back into the box, ready to send again.
    if (outcome === "failed") setDraft((current) => current || question);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteConversation(toDelete.id);
    } catch (error) {
      if (!isNotFound(error)) {
        setDeleteError(extractErrorMessage(error));
        setIsDeleting(false);
        return;
      }
    }
    remove(toDelete.id);
    if (toDelete.id === activeId) navigate("/assistant");
    setToDelete(null);
    setIsDeleting(false);
  }

  const available = status.data?.available ?? true;
  const maxLength = status.data?.max_question_length ?? DEFAULT_MAX_LENGTH;
  const isNewChat = activeId === null && chat.messages.length === 0 && !chat.isAsking;

  function renderThread() {
    if (chat.isLoading) {
      return (
        <div className={styles.loading} aria-label="Loading conversation">
          <Skeleton height={44} width="60%" borderRadius={16} />
          <Skeleton height={88} width="80%" borderRadius={16} />
        </div>
      );
    }
    if (chat.loadError) {
      return isNotFound(chat.loadError) ? (
        <div className={styles.gone} role="alert">
          <p>This conversation no longer exists — it may have been deleted on another device.</p>
          <Link to="/assistant">Start a new chat</Link>
        </div>
      ) : (
        <ErrorState error={chat.loadError} onRetry={chat.reload} />
      );
    }
    if (isNewChat) {
      return (
        <div className={styles.welcome}>
          <p className={styles.welcomeTitle}>What would you like to know about your money?</p>
          {status.isLoading ? (
            <Skeleton height={96} />
          ) : (
            <SuggestedQuestions
              questions={status.data?.suggested_questions ?? []}
              onPick={(question) => void ask(question)}
              disabled={!available}
            />
          )}
        </div>
      );
    }
    return <ChatMessages messages={chat.messages} pendingQuestion={chat.pendingQuestion} />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>AI Assistant</h1>
          <p className={styles.subtitle}>
            Ask about your spending, budgets, subscriptions and savings goals. Answers are based only on your
            Spendly data.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.historyToggle}
            onClick={() => setIsHistoryOpen((open) => !open)}
            aria-expanded={isHistoryOpen}
            aria-controls="assistant-history"
          >
            {isHistoryOpen ? "Hide history" : "History"}
          </button>
          <Link to="/assistant" className={styles.newChat} onClick={() => setIsHistoryOpen(false)}>
            New chat
          </Link>
        </div>
      </div>

      <div className={styles.layout}>
        <aside id="assistant-history" className={`${styles.sidebar} ${isHistoryOpen ? styles.sidebarOpen : ""}`}>
          <ConversationList
            conversations={history.conversations}
            isLoading={history.isLoading}
            error={history.error}
            onRetry={history.refetch}
            hasMore={history.nextPage !== null}
            isLoadingMore={history.isLoadingMore}
            onLoadMore={history.loadMore}
            onDelete={(conversation) => {
              setDeleteError(null);
              setToDelete(conversation);
            }}
            onOpen={() => setIsHistoryOpen(false)}
          />
        </aside>

        <section className={styles.chat} aria-label="Chat">
          {status.data && !status.data.available && (
            <p className={styles.notice} role="note">
              The AI assistant isn&apos;t set up on this server yet: it needs a model API key (ANTHROPIC_API_KEY).
            </p>
          )}
          {status.error !== null && (
            <ErrorState error={status.error} onRetry={status.refetch} />
          )}

          <div className={styles.thread}>{renderThread()}</div>

          <div className={styles.composerArea}>
            <ErrorBanner message={chat.sendError} />
            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSubmit={(question) => void ask(question)}
              maxLength={maxLength}
              disabled={!available || chat.isAsking || chat.isLoading || chat.loadError !== null}
            />
            <p className={styles.disclaimer}>
              The assistant only reads your data — it can&apos;t change anything. It can make mistakes, so check
              important figures in the app.
            </p>
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={toDelete !== null}
        title="Delete conversation?"
        message={
          deleteError ??
          `"${toDelete?.title ?? ""}" and its messages will be deleted on all your devices. This can't be undone.`
        }
        confirmLabel="Delete"
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
