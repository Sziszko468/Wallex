import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../hooks/useAuth";
import { listSessions, revokeSession } from "../../services/securityService";
import type { ClientPlatform, Session } from "../../types/security";
import { extractErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/format";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { ErrorBanner } from "../ErrorBanner";
import { ErrorState } from "../ErrorState";
import { Skeleton } from "../Skeleton";
import styles from "./SecurityCards.module.scss";

const PLATFORM_LABELS: Record<ClientPlatform, string> = {
  web: "Browser",
  ios: "iPhone app",
  android: "Android app",
  unknown: "Other device",
};

/** Where the account is signed in, with "sign out" per device and everywhere. */
export function DevicesCard() {
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
    <div className={styles.card}>
      <h2>Signed-in devices</h2>
      <p className={styles.hint}>Sign out any device you don&apos;t recognise. Its access ends immediately.</p>
      <ErrorBanner message={error} />
      {sessions.isLoading ? (
        <Skeleton height={64} />
      ) : sessions.error ? (
        <ErrorState error={sessions.error} onRetry={sessions.refetch} />
      ) : (
        <ul className={styles.list}>
          {sessions.data?.map((session) => (
            <li key={session.id} className={styles.row}>
              <div>
                <strong>{PLATFORM_LABELS[session.platform]}</strong>
                {session.current && <span className={styles.badge}>This device</span>}
                <div className={styles.meta}>{session.user_agent || "Unknown app"}</div>
                <div className={styles.meta}>
                  Signed in {formatDateTime(session.created_at)} · last active {formatDateTime(session.last_used_at)}
                  {session.ip_address ? ` · ${session.ip_address}` : ""}
                </div>
              </div>
              {!session.current && (
                <Button variant="secondary" onClick={() => void signOut(session)} aria-label={`Sign out ${PLATFORM_LABELS[session.platform]} signed in ${formatDateTime(session.created_at)}`}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button variant="danger" onClick={() => setIsConfirmingAll(true)}>
        Log out of all devices
      </Button>
      <ConfirmDialog
        isOpen={isConfirmingAll}
        title="Log out of all devices?"
        message="Every browser and phone signed in to your account is signed out, this one included. You will need your password to sign in again."
        confirmLabel="Log out everywhere"
        isConfirming={isSigningOutAll}
        onConfirm={signOutEverywhere}
        onClose={() => setIsConfirmingAll(false)}
      />
    </div>
  );
}
