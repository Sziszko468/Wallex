import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../hooks/useAuth";
import { listSessions, revokeSession } from "../../services/securityService";
import type { Session } from "../../types/security";
import { extractErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/format";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Card } from "../Card";
import { Icon } from "../icons/Icon";
import { ConfirmDialog } from "../ConfirmDialog";
import { ErrorBanner } from "../ErrorBanner";
import { ErrorState } from "../ErrorState";
import { Skeleton } from "../Skeleton";
import styles from "./SecurityCards.module.scss";

/** Where the account is signed in, with "sign out" per device and everywhere. */
export function DevicesCard() {
  const { t } = useTranslation();
  const { logoutEverywhere } = useAuth();
  const navigate = useNavigate();
  const sessions = useAsyncData(useCallback(() => listSessions(), []));
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);

  async function signOut(session: Session) {
    setError(null);
    try {
      await revokeSession(session.id);
      await sessions.revalidate();
    } catch (revokeError) {
      setError(extractErrorMessage(revokeError));
    }
  }

  async function signOutEverywhere() {
    setIsSigningOutAll(true);
    try {
      await logoutEverywhere();
      navigate("/login", { replace: true });
    } catch (logoutError) {
      setError(extractErrorMessage(logoutError));
      setIsSigningOutAll(false);
      setIsConfirmingAll(false);
    }
  }

  return (
    <Card padding="lg" className={styles.card}>
      <h2 className={styles.title}>{t("security.devices.title")}</h2>
      <p className={styles.hint}>{t("security.devices.hint")}</p>
      <ErrorBanner message={error} />
      {sessions.isLoading ? (
        <Skeleton height={64} />
      ) : sessions.error ? (
        <ErrorState error={sessions.error} onRetry={sessions.refetch} />
      ) : (
        <ul className={styles.list}>
          {sessions.data?.map((session) => (
            <li key={session.id} className={styles.row}>
              <span className={styles.deviceIcon} aria-hidden="true">
                <Icon name={session.platform === "web" || session.platform === "unknown" ? "monitor" : "smartphone"} size={20} />
              </span>
              <div className={styles.rowText}>
                <strong>{t(`security.devices.platforms.${session.platform}`)}</strong>
                {session.current && <Badge tone="primary" className={styles.badge}>{t("security.devices.thisDevice")}</Badge>}
                <div className={styles.meta}>{session.user_agent || t("security.devices.unknownApp")}</div>
                <div className={styles.meta}>
                  {t("security.devices.activity", { signedIn: formatDateTime(session.created_at), lastActive: formatDateTime(session.last_used_at) })}
                  {session.ip_address ? ` · ${session.ip_address}` : ""}
                </div>
              </div>
              {!session.current && (
                <Button variant="secondary" onClick={() => void signOut(session)} aria-label={t("security.devices.signOutLabel", { platform: t(`security.devices.platforms.${session.platform}`), signedIn: formatDateTime(session.created_at) })}>
                  {t("security.devices.signOut")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button variant="danger-quiet" leadingIcon="log-out" onClick={() => setIsConfirmingAll(true)}>
        {t("security.devices.logOutAll")}
      </Button>
      <ConfirmDialog
        isOpen={isConfirmingAll}
        title={t("security.devices.confirmTitle")}
        message={t("security.devices.confirmMessage")}
        confirmLabel={t("security.devices.confirmLabel")}
        isConfirming={isSigningOutAll}
        onConfirm={signOutEverywhere}
        onClose={() => setIsConfirmingAll(false)}
      />
    </Card>
  );
}
