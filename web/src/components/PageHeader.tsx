import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./icons/Icon";
import styles from "./PageHeader.module.scss";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or controls for the page, aligned to the right on wide screens. */
  actions?: ReactNode;
  /** A link back to the list this page belongs to (detail pages). */
  backTo?: { to: string; label: string };
}

/** The top of every page: title, a line of context, and the page's main actions. */
export function PageHeader({ title, description, actions, backTo }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {backTo && (
        <Link to={backTo.to} className={styles.back}>
          <Icon name="arrow-left" size={16} />
          {backTo.label}
        </Link>
      )}
      <div className={styles.row}>
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}
