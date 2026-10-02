import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AssistantMessage } from "../../types/assistant";
import { Icon } from "../icons/Icon";
import { MarkdownText } from "./MarkdownText";
import styles from "./ChatMessages.module.scss";

interface ChatMessagesProps {
  messages: AssistantMessage[];
  /** Asked, answer not here yet. */
  pendingQuestion: string | null;
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

export function ChatMessages({ messages, pendingQuestion }: ChatMessagesProps) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [messages.length, pendingQuestion]);

  return (
    <div className={styles.thread}>
      <ol className={styles.messages} role="log" aria-label={t("assistant.messages.conversation")} aria-live="polite">
        {messages.map((message) => (
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
      <div ref={endRef} />
    </div>
  );
}
