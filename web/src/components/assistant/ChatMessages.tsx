import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AssistantMessage } from "../../types/assistant";
import { Icon } from "../icons/Icon";
import { FollowUpQuestions } from "./FollowUpQuestions";
import { InsightCards } from "./InsightCards";
import { MarkdownText } from "./MarkdownText";
import styles from "./ChatMessages.module.scss";

interface ChatMessagesProps {
  messages: AssistantMessage[];
  /** Asked, answer not here yet. */
  pendingQuestion: string | null;
  /** Sends a follow-up question (the chips under the latest answer). */
  onAsk: (question: string) => void;
  /** False while another answer is on its way, or when the assistant can't be used. */
  canAsk: boolean;
}

function AssistantAvatar() {
  return (
    <span className={styles.avatar} aria-hidden="true">
      <Icon name="assistant" size={16} />
    </span>
  );
}

function Sources({ message }: { message: AssistantMessage }) {
  const { t } = useTranslation();
  if (message.sources.length === 0) return null;
  return (
    <ul className={styles.sources} aria-label={t("assistant.messages.basedOn")}>
      {message.sources.map((source, index) => (
        <li key={index} className={styles.source}>
          {source.label}
          {source.detail && <span className={styles.sourceDetail}> · {source.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ChatMessages({ messages, pendingQuestion, onAsk, canAsk }: ChatMessagesProps) {
  const { t } = useTranslation();

  useEffect(() => {
    // The composer is sticky below the thread, so aligning the thread's end with the window would
    // leave the last answer's cards and follow-ups hidden behind it: scroll the page to its end.
    const page = document.scrollingElement;
    page?.scrollTo?.({ top: page.scrollHeight, behavior: "smooth" });
  }, [messages.length, pendingQuestion]);

  return (
    <div className={styles.thread}>
      <ol className={styles.messages} role="log" aria-label={t("assistant.messages.conversation")} aria-live="polite">
        {messages.map((message, index) => (
          <li
            key={message.id}
            className={message.role === "user" ? styles.fromUser : styles.fromAssistant}
            aria-label={message.role === "user" ? t("assistant.messages.you") : t("assistant.messages.assistant")}
          >
            <div className={styles.bubbleRow}>
              {message.role === "assistant" && <AssistantAvatar />}
              <div className={styles.bubble}>
                {message.role === "user" ? (
                  <p className={styles.question}>{message.content}</p>
                ) : (
                  <MarkdownText text={message.content} />
                )}
              </div>
            </div>
            {message.role === "assistant" && <Sources message={message} />}
            {message.role === "assistant" && <InsightCards insights={message.insights} />}
            {/* Only the latest answer offers follow-ups, and not while the next one is being prepared. */}
            {message.role === "assistant" && index === messages.length - 1 && pendingQuestion === null && (
              <FollowUpQuestions questions={message.suggested_questions} onPick={onAsk} disabled={!canAsk} />
            )}
          </li>
        ))}
        {pendingQuestion !== null && (
          <>
            <li className={styles.fromUser} aria-label={t("assistant.messages.you")}>
              <div className={styles.bubble}>
                <p className={styles.question}>{pendingQuestion}</p>
              </div>
            </li>
            <li className={styles.fromAssistant} aria-label={t("assistant.messages.assistant")}>
              <div className={styles.bubbleRow}>
                <AssistantAvatar />
                <div className={`${styles.bubble} ${styles.thinking}`} role="status">
                  {t("assistant.messages.thinking")}
                  <span className={styles.dots} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            </li>
          </>
        )}
      </ol>
    </div>
  );
}
