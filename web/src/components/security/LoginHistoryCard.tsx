import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../../hooks/useAsyncData";
import { listSecurityEvents } from "../../services/securityService";
import { formatDateTime } from "../../utils/format";
import { Card } from "../Card";
import { ErrorState } from "../ErrorState";
import { Skeleton } from "../Skeleton";
import styles from "./SecurityCards.module.scss";

const FAILED = new Set(["login_failed", "login_blocked", "mfa_failed"]);

/** The latest sign-in attempts on the account — also failed ones, from anywhere. */
export function LoginHistoryCard() {
  const { t } = useTranslation();
  const history = useAsyncData(useCallback(() => listSecurityEvents("login"), []));

  return (
    <Card padding="lg" className={styles.card}>
      <h2 className={styles.title}>{t("security.history.title")}</h2>
      <p className={styles.hint}>{t("security.history.hint")}</p>
      {history.isLoading ? (
        <Skeleton height={64} />
      ) : history.error ? (
        <ErrorState error={history.error} onRetry={history.refetch} />
      ) : history.data?.results.length ? (
        <ul className={styles.list}>
          {history.data.results.map((event) => (
            <li key={event.id} className={styles.row}>
              <div className={styles.rowText}>
                <strong className={FAILED.has(event.action) ? styles.failed : undefined}>{event.description}</strong>
                <div className={styles.meta}>
                  {formatDateTime(event.created_at)}
                  {event.ip_address ? ` · ${event.ip_address}` : ""}
                  {event.user_agent ? ` · ${event.user_agent}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.meta}>{t("security.history.empty")}</p>
      )}
    </Card>
  );
}
