import { Icon } from "./icons/Icon";
import styles from "./ErrorBanner.module.scss";

interface ErrorBannerProps {
  message: string | null;
}

/** A form- or action-level error, shown where the user is looking. Announced to screen readers. */
export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div className={styles.banner} role="alert">
      <Icon name="alert-circle" size={18} className={styles.icon} />
      <span>{message}</span>
    </div>
  );
}
