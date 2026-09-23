import { extractErrorMessage } from "../utils/errors";
import styles from "./ErrorState.module.scss";

interface ErrorStateProps {
  error?: unknown;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const message = error ? extractErrorMessage(error) : "Something went wrong.";

  return (
    <div className={styles.errorState} role="alert">
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
