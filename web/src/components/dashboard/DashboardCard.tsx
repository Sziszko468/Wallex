import type { ReactNode } from "react";
import styles from "./DashboardCard.module.scss";

interface DashboardCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function DashboardCard({ title, children, className }: DashboardCardProps) {
  const classes = className ? `${styles.card} ${className}` : styles.card;
  return (
    <section className={classes}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
