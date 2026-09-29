import { useState, type FormEvent } from "react";
import { changePassword } from "../../services/securityService";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { Button } from "../Button";
import { ErrorBanner } from "../ErrorBanner";
import { TextField } from "../TextField";
import styles from "./SecurityCards.module.scss";

/** The server checks the password policy; the form only makes sure both new entries match. */
export function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (next !== confirmation) {
      setFieldErrors({ confirmation: "The new passwords don't match." });
      return;
    }
    setFieldErrors({});
    setIsSaving(true);
    try {
      const signedOut = await changePassword({ current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirmation("");
      setNotice(
        signedOut === 0
          ? "Password changed."
          : `Password changed. ${signedOut} other device${signedOut === 1 ? " was" : "s were"} signed out.`
      );
    } catch (saveError) {
      const errors = extractFieldErrors(saveError);
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) setError(extractErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.card}>
      <h2>Password</h2>
      <p className={styles.hint}>
        At least 12 characters — a few unrelated words make a strong, memorable passphrase. Changing it signs
        out your other devices.
      </p>
      <ErrorBanner message={error} />
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={fieldErrors.current_password}
          required
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          error={fieldErrors.new_password}
          required
        />
        <TextField
          label="Repeat the new password"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          error={fieldErrors.confirmation}
          required
        />
        <Button type="submit" isLoading={isSaving}>
          Change password
        </Button>
      </form>
    </div>
  );
}
