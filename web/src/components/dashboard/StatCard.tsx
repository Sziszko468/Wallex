import { Skeleton } from "../Skeleton";
import styles from "./StatCard.module.scss";

interface StatCardProps {
  label: string;
  value?: string;
  tone?: "positive" | "negative" | "neutral";
  isLoading?: boolean;
}

export function StatCard({ label, value, tone = "neutral", isLoading = false }: StatCardProps) {
  return (
    <div className={styles.card}>
      <span className={styles.label}>{label}</span>
      {isLoading ? (
        <Skeleton height="1.75rem" width="70%" />
      ) : (
        <span className={`${styles.value} ${styles[tone]}`}>{value}</span>
      )}
    </div>
  );
}
