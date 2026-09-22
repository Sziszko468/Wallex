import styles from "./Spinner.module.scss";

interface SpinnerProps {
  fullPage?: boolean;
  label?: string;
}

export function Spinner({ fullPage = false, label = "Loading…" }: SpinnerProps) {
  const content = (
    <div className={styles.spinner} role="status" aria-live="polite">
      <span className={styles.circle} />
      <span className={styles.label}>{label}</span>
    </div>
  );

  if (!fullPage) return content;

  return <div className={styles.fullPage}>{content}</div>;
}
