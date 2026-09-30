import type { ReactNode } from "react";
import styles from "./DetailList.module.scss";

export interface DetailItem {
  label: string;
  value: ReactNode;
}

interface DetailListProps {
  items: DetailItem[];
}

/** Label / value pairs for "details" sections: quiet labels on the left, the facts on the right. */
export function DetailList({ items }: DetailListProps) {
  return (
    <dl className={styles.list}>
      {items.map((item) => (
        <div key={item.label} className={styles.item}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
