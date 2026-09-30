import { extractErrorMessage } from "../utils/errors";
import { Button } from "./Button";
import { Icon } from "./icons/Icon";
import styles from "./ErrorState.module.scss";

interface ErrorStateProps {
  error?: unknown;
  onRetry?: () => void;
  /** What couldn't be shown. Defaults to a general line. */
  title?: string;
}

/** Something failed to load: says so plainly, says what to do, and offers the retry. */
export function ErrorState({ error, onRetry, title = "We couldn't load this" }: ErrorStateProps) {
  const message = error ? extractErrorMessage(error) : "Something went wrong.";

  return (
    <div className={styles.errorState} role="alert">
      <span className={styles.iconTile} aria-hidden="true">
        <Icon name="alert-circle" size={20} />
      </span>
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" leadingIcon="refresh" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
