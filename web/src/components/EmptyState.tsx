import type { ReactNode } from "react";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconPaths";
import styles from "./EmptyState.module.scss";

const ICON_SIZE = { panel: 26, inline: 20 } as const;

interface EmptyStateProps {
  /** What's missing and what to do about it — one or two calm sentences. */
  message: string;
  /** With a title (and usually an icon and action) the empty state becomes a full, centred panel. */
  title?: string;
  icon?: IconName;
  /** The obvious next step: a button or link. */
  action?: ReactNode;
}

/**
 * Two sizes from one component. Inside a dashboard card, a bare `message` is a quiet line of text.
 * On a page that has nothing yet, add a `title`, `icon` and `action` to tell the user why it matters
 * and what to do next.
 */
export function EmptyState({ message, title, icon, action }: EmptyStateProps) {
  const isPanel = Boolean(title);
  return (
    <div className={isPanel ? `${styles.empty} ${styles.panel}` : styles.empty}>
      {icon && (
        <span className={styles.iconTile} aria-hidden="true">
          <Icon name={icon} size={isPanel ? ICON_SIZE.panel : ICON_SIZE.inline} />
        </span>
      )}
      {title && <h2 className={styles.title}>{title}</h2>}
      <p className={styles.message}>{message}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
