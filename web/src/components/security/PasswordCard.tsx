import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PASSWORD_MIN_LENGTH } from "../../config/security";
import { changePassword } from "../../services/securityService";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { Button } from "../Button";
import { Card } from "../Card";
import { Notice } from "../Notice";
import formStyles from "../form.module.scss";
import { ErrorBanner } from "../ErrorBanner";
import { TextField } from "../TextField";
import styles from "./SecurityCards.module.scss";

/** The server checks the password policy; the form only makes sure both new entries match. */
export function PasswordCard() {
  const { t } = useTranslation();
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
      setFieldErrors({ confirmation: t("security.password.mismatch") });
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
        signedOut === 0 ? t("security.password.changed") : t("security.password.changedSignedOut", { count: signedOut })
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
    <Card padding="lg" className={styles.card}>
      <h2 className={styles.title}>{t("security.password.title")}</h2>
      <p className={styles.hint}>{t("security.password.hint", { count: PASSWORD_MIN_LENGTH })}</p>
      <ErrorBanner message={error} />
      {notice && <Notice tone="success">{notice}</Notice>}
      <form onSubmit={handleSubmit} noValidate className={formStyles.stack}>
        <TextField
          label={t("security.password.current")}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={fieldErrors.current_password}
          required
        />
        <TextField
          label={t("security.password.new")}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          error={fieldErrors.new_password}
          required
        />
        <TextField
          label={t("security.password.repeat")}
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          error={fieldErrors.confirmation}
          required
        />
        <Button type="submit" isLoading={isSaving} className={styles.submit}>
          {t("security.password.submit")}
        </Button>
      </form>
    </Card>
  );
}
