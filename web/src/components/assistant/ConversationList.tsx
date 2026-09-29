import { NavLink } from "react-router-dom";
import type { AssistantConversationSummary } from "../../types/assistant";
import { Skeleton } from "../Skeleton";
import { ErrorState } from "../ErrorState";
import styles from "./ConversationList.module.scss";

interface ConversationListProps {
  conversations: AssistantConversationSummary[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onDelete: (conversation: AssistantConversationSummary) => void;
  /** A conversation was opened (the mobile layout closes the list). */
  onOpen: () => void;
}

/** "Today, 14:05" / "Sep 27" — when the conversation was last active. */
function lastActive(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? `Today, ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ConversationList({
  conversations,
  isLoading,
  error,
  onRetry,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onDelete,
  onOpen,
}: ConversationListProps) {
  return (
    <nav className={styles.history} aria-label="Conversation history">
      <h2 className={styles.heading}>History</h2>
      {isLoading ? (
        <div className={styles.placeholder}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : conversations.length === 0 ? (
        <p className={styles.empty}>Your conversations will appear here.</p>
      ) : (
        <>
          <ul className={styles.list}>
            {conversations.map((conversation) => (
              <li key={conversation.id} className={styles.item}>
                <NavLink
                  to={`/assistant/${conversation.id}`}
                  className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
                  onClick={onOpen}
                >
                  <span className={styles.title}>{conversation.title}</span>
                  <span className={styles.date}>{lastActive(conversation.updated_at)}</span>
                </NavLink>
                <button
                  type="button"
                  className={styles.delete}
                  onClick={() => onDelete(conversation)}
                  aria-label={`Delete conversation: ${conversation.title}`}
                  title="Delete conversation"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button type="button" className={styles.more} onClick={onLoadMore} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading…" : "Show older"}
            </button>
          )}
        </>
      )}
    </nav>
  );
}
