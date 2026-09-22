import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/Button";
import styles from "./SettingsPage.module.scss";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <section>
      <h1>Settings</h1>

      <div className={styles.card}>
        <h2>Profile</h2>
        <dl className={styles.profile}>
          <dt>Email</dt>
          <dd>{user?.email}</dd>
          <dt>First name</dt>
          <dd>{user?.first_name || "—"}</dd>
          <dt>Last name</dt>
          <dd>{user?.last_name || "—"}</dd>
          <dt>Member since</dt>
          <dd>{user ? new Date(user.date_joined).toLocaleDateString() : "—"}</dd>
        </dl>
      </div>

      <div className={styles.card}>
        <h2>Session</h2>
        <p>Log out of Spendly on this device.</p>
        <Button variant="danger" onClick={handleLogout} isLoading={isLoggingOut}>
          Log out
        </Button>
      </div>
    </section>
  );
}
