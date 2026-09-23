import styles from "./EmptyState.module.scss";

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return <p className={styles.emptyState}>{message}</p>;
}
