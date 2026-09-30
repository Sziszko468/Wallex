import type { ReactNode } from "react";
import { Card } from "./Card";
import styles from "./ListRow.module.scss";

interface RowListProps {
  /** Names the list for screen readers ("Subscriptions"). */
  label: string;
  children: ReactNode;
}

/** The soft surface that holds a list of rows: one card, no borders between the rows inside. */
export function RowList({ label, children }: RowListProps) {
  return (
    <Card padding="none" className={styles.surface}>
      <ul className={styles.list} aria-label={label}>
        {children}
      </ul>
    </Card>
  );
}

interface ListRowProps {
  /** Usually a CategoryMark. */
  leading: ReactNode;
  /** The row's name — may be a link. */
  title: ReactNode;
  /** A quieter second line. */
  meta?: ReactNode;
  /** Figures, right-aligned (an amount, a cost). */
  trailing?: ReactNode;
  /** Icon buttons: revealed on hover on desktop, always shown on touch screens. */
  actions?: ReactNode;
  /** A paused or ended item: present, but quieter. */
  dimmed?: boolean;
}

/** One row of a list: mark, name and detail, figures, actions. Used by Recurring and Subscriptions. */
export function ListRow({ leading, title, meta, trailing, actions, dimmed = false }: ListRowProps) {
  return (
    <li className={dimmed ? `${styles.row} ${styles.dimmed}` : styles.row}>
      <span className={styles.leading}>{leading}</span>
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        {meta && <div className={styles.meta}>{meta}</div>}
      </div>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </li>
  );
}
