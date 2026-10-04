import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { deleteConversation, getAssistantStatus } from "../services/assistantService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useAssistantChat } from "../hooks/useAssistantChat";
import { useConversationHistory } from "../hooks/useConversationHistory";
import { usePageTitle } from "../hooks/usePageTitle";
import type { AssistantConversationSummary, AssistantExchange } from "../types/assistant";
import { extractErrorMessage, isNotFound } from "../utils/errors";
import { ChatComposer } from "../components/assistant/ChatComposer";
import { ChatMessages } from "../components/assistant/ChatMessages";
import { ConversationList } from "../components/assistant/ConversationList";
import { SuggestedQuestions } from "../components/assistant/SuggestedQuestions";
import { Button } from "../components/Button";
import { ButtonLink } from "../components/ButtonLink";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { Notice } from "../components/Notice";
import { ErrorBanner } from "../components/ErrorBanner";
import { ErrorState } from "../components/ErrorState";
import { Skeleton } from "../components/Skeleton";
import pageStyles from "../components/page.module.scss";
import styles from "./AssistantPage.module.scss";

const DEFAULT_MAX_LENGTH = 1000;

function parseConversationId(param: string | undefined): number | null {
  const id = Number(param);
  return param !== undefined && Number.isInteger(id) && id > 0 ? id : null;
}

/** /assistant — a new chat; /assistant/:conversationId — a conversation from the history. */
export function AssistantPage() {
  const { t } = useTranslation();
  usePageTitle(t("nav.items.assistant"));
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
        <div className={styles.loading} aria-label={t("assistant.loadingConversation")}>
          <Skeleton height={44} width="60%" borderRadius={16} />
          <Skeleton height={88} width="80%" borderRadius={16} />
        </div>
      );
    }
    if (chat.loadError) {
      return isNotFound(chat.loadError) ? (
        <div className={styles.gone} role="alert">
          <p>{t("assistant.gone")}</p>
          <Link to="/assistant">{t("assistant.startNew")}</Link>
        </div>
      ) : (
        <ErrorState error={chat.loadError} onRetry={chat.reload} />
      );
    }
    if (isNewChat) {
      return (
        <div className={styles.welcome}>
          <p className={styles.welcomeTitle}>{t("assistant.welcome")}</p>
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
    return (
      <ChatMessages
        messages={chat.messages}
        pendingQuestion={chat.pendingQuestion}
        onAsk={(question) => void ask(question)}
        canAsk={available && !chat.isAsking}
      />
    );
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={t("assistant.title")}
        description={t("assistant.description")}
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon="clock"
              className={styles.historyToggle}
              onClick={() => setIsHistoryOpen((open) => !open)}
              aria-expanded={isHistoryOpen}
              aria-controls="assistant-history"
            >
              {isHistoryOpen ? t("assistant.hideHistory") : t("assistant.history")}
            </Button>
            <ButtonLink to="/assistant" leadingIcon="plus" onClick={() => setIsHistoryOpen(false)}>
              {t("assistant.newChat")}
            </ButtonLink>
          </>
        }
      />

      <div className={styles.layout}>
        <Card as="aside" id="assistant-history" className={`${styles.sidebar} ${isHistoryOpen ? styles.sidebarOpen : ""}`}>
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
        </Card>

        <section className={styles.chat} aria-label={t("assistant.chat")}>
          {status.data && !status.data.available && (
            <Notice tone="warning" role="note">
              {t("assistant.notConfigured")}
            </Notice>
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
              {t("assistant.disclaimer")}
            </p>
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={toDelete !== null}
        title={t("assistant.deleteDialog.title")}
        message={deleteError ?? t("assistant.deleteDialog.message", { title: toDelete?.title ?? "" })}
        confirmLabel={t("common.actions.delete")}
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
