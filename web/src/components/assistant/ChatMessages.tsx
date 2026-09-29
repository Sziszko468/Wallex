import { useEffect, useRef } from "react";
import type { AssistantMessage } from "../../types/assistant";
import { MarkdownText } from "./MarkdownText";
import styles from "./ChatMessages.module.scss";

interface ChatMessagesProps {
  messages: AssistantMessage[];
  /** Asked, answer not here yet. */
  pendingQuestion: string | null;
}

function Sources({ message }: { message: AssistantMessage }) {
  if (message.sources.length === 0) return null;
  return (
    <ul className={styles.sources} aria-label="Based on">
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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [messages.length, pendingQuestion]);

  return (
    <div className={styles.thread}>
      <ol className={styles.messages} role="log" aria-label="Conversation" aria-live="polite">
        {messages.map((message) => (
          <li
            key={message.id}
            className={message.role === "user" ? styles.fromUser : styles.fromAssistant}
            aria-label={message.role === "user" ? "You" : "Assistant"}
          >
            <div className={styles.bubble}>
              {message.role === "user" ? (
                <p className={styles.question}>{message.content}</p>
              ) : (
                <MarkdownText text={message.content} />
              )}
            </div>
            {message.role === "assistant" && <Sources message={message} />}
          </li>
        ))}
        {pendingQuestion !== null && (
          <>
            <li className={styles.fromUser} aria-label="You">
              <div className={styles.bubble}>
                <p className={styles.question}>{pendingQuestion}</p>
              </div>
            </li>
            <li className={styles.fromAssistant} aria-label="Assistant">
              <div className={`${styles.bubble} ${styles.thinking}`} role="status">
                Checking your data
                <span className={styles.dots} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </li>
          </>
        )}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
