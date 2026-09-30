import { BrandMark } from "./icons/BrandMark";
import styles from "./Spinner.module.scss";

interface SpinnerProps {
  fullPage?: boolean;
  label?: string;
}

/** The app's loading indicator: the brand ring, slowly turning. */
export function Spinner({ fullPage = false, label = "Loading…" }: SpinnerProps) {
  const content = (
    <div className={styles.spinner} role="status" aria-live="polite">
      <span className={styles.ring}>
        <BrandMark size={fullPage ? 40 : 22} />
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  );

  if (!fullPage) return content;

  return <div className={styles.fullPage}>{content}</div>;
}
