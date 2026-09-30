import styles from "./ProgressBar.module.scss";

interface ProgressBarProps {
  /** The API's percentage — may exceed 100; only the bar's width is clamped. */
  percentage: number;
  label: string;
  tone?: "default" | "complete" | "muted" | "warning" | "danger";
  size?: "small" | "large";
  /** A tick on the bar (0–100): for budgets, where spending should be by today. Decorative. */
  marker?: number;
}

export function ProgressBar({ percentage, label, tone = "default", size = "small", marker }: ProgressBarProps) {
  const width = Math.min(Math.max(percentage, 0), 100);
  return (
    <div
      className={`${styles.track} ${styles[size]}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div className={`${styles.fill} ${styles[tone]}`} style={{ width: `${width}%` }} />
      {marker !== undefined && <span className={styles.marker} style={{ left: `${Math.min(Math.max(marker, 0), 100)}%` }} aria-hidden="true" />}
    </div>
  );
}
