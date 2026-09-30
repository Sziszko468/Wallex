import type { CSSProperties } from "react";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";
import styles from "./SummaryStrip.module.scss";

export interface SummaryItem {
  label: string;
  value?: string;
  /** A line of context under the value. */
  hint?: string;
  tone?: "default" | "positive" | "negative" | "warning";
  isLoading?: boolean;
}

interface SummaryStripProps {
  items: SummaryItem[];
}

/**
 * A few headline figures in one surface instead of a row of identical cards: the first is the
 * headline (larger), the rest support it, and quiet dividers separate them.
 */
export function SummaryStrip({ items }: SummaryStripProps) {
  return (
    <Card padding="none">
      <dl className={styles.strip} style={{ "--rest": items.length - 1 } as CSSProperties}>
        {items.map((item, index) => (
          <div key={item.label} className={index === 0 ? `${styles.stat} ${styles.primary}` : styles.stat}>
            <dt className={styles.label}>{item.label}</dt>
            <dd className={styles.value}>
              {item.isLoading ? (
                <Skeleton width="70%" height={index === 0 ? "2rem" : "1.5rem"} />
              ) : (
                <span className={item.tone ? styles[item.tone] : undefined}>{item.value}</span>
              )}
            </dd>
            {item.hint && <dd className={styles.hint}>{item.hint}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}
