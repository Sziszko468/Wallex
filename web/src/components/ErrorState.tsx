import { useTranslation } from "react-i18next";
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
export function ErrorState({ error, onRetry, title }: ErrorStateProps) {
  const { t } = useTranslation();
  const message = error ? extractErrorMessage(error) : t("common.states.somethingWentWrong");

  return (
    <div className={styles.errorState} role="alert">
      <span className={styles.iconTile} aria-hidden="true">
        <Icon name="alert-circle" size={20} />
      </span>
      <p className={styles.title}>{title ?? t("common.states.loadFailedTitle")}</p>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" leadingIcon="refresh" onClick={onRetry}>
          {t("common.actions.retry")}
        </Button>
      )}
    </div>
  );
}
