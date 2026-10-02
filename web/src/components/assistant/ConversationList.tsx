import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { t } from "i18next";
import { currentLocale } from "../../i18n";
import type { AssistantConversationSummary } from "../../types/assistant";
import { Button } from "../Button";
import { IconButton } from "../IconButton";
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
    ? t("assistant.list.today", { time: date.toLocaleTimeString(currentLocale(), { hour: "2-digit", minute: "2-digit" }) })
    : date.toLocaleDateString(currentLocale(), { month: "short", day: "numeric" });
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
  const { t } = useTranslation();
  return (
    <nav className={styles.history} aria-label={t("assistant.list.label")}>
      <h2 className={styles.heading}>{t("assistant.history")}</h2>
      {isLoading ? (
        <div className={styles.placeholder}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : conversations.length === 0 ? (
        <p className={styles.empty}>{t("assistant.list.empty")}</p>
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
                <IconButton
                  icon="trash"
                  label={t("assistant.list.delete", { title: conversation.title })}
                  variant="danger"
                  size="sm"
                  className={styles.delete}
                  onClick={() => onDelete(conversation)}
                />
              </li>
            ))}
          </ul>
          {hasMore && (
            <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
              {isLoadingMore ? t("common.states.loading") : t("assistant.list.showOlder")}
            </Button>
          )}
        </>
      )}
    </nav>
  );
}
