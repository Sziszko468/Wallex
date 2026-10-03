import { useCallback, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../hooks/useAuth";
import { downloadMyData, getMfaStatus } from "../../services/securityService";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { saveTextFile } from "../../utils/download";
import { Button } from "../Button";
import { Card } from "../Card";
import { ErrorBanner } from "../ErrorBanner";
import { Notice } from "../Notice";
import { TextField } from "../TextField";
import formStyles from "../form.module.scss";
import styles from "./SecurityCards.module.scss";

type Step = "idle" | "download" | "delete";

/** Access and erasure: download everything stored about the account, or delete the account for good. */
export function DataCard() {
  const { t } = useTranslation();
  const { deleteAccount } = useAuth();
  // Two-factor users confirm a deletion with a code too; the status says whether to ask for it.
  const twoFactor = useAsyncData(useCallback(() => getMfaStatus(), []));
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  function goTo(next: Step) {
    setStep(next);
    setPassword("");
    setCode("");
    setError(null);
    setFieldErrors({});
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setFieldErrors({});
    setIsBusy(true);
    try {
      await action();
    } catch (actionError) {
      const errors = extractFieldErrors(actionError);
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) setError(extractErrorMessage(actionError));
    } finally {
      setIsBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step === "download") {
      void run(async () => {
        const file = await downloadMyData(password);
        saveTextFile(file.filename, file.text);
        goTo("idle");
        setNotice(t("security.data.downloaded", { filename: file.filename }));
      });
    } else if (step === "delete") {
      // On success the account is gone and the app signs out: the page leaves for the login screen.
      void run(() => deleteAccount({ password, code: twoFactor.data?.enabled ? code : undefined }));
    }
  }

  const passwordField = (
    <TextField
      label={t("auth.fields.password")}
      type="password"
      autoComplete="current-password"
      value={password}
      onChange={(event) => setPassword(event.target.value)}
      error={fieldErrors.password}
      required
    />
  );

  return (
    <Card padding="lg" className={styles.card}>
      <h2 className={styles.title}>{t("security.data.title")}</h2>
      <p className={styles.hint}>{t("security.data.hint")}</p>
      <ErrorBanner message={error} />
      {notice && step === "idle" && <Notice tone="success">{notice}</Notice>}

      {step === "idle" && (
        <div className={formStyles.inlineActions}>
          <Button variant="secondary" onClick={() => goTo("download")}>
            {t("security.data.download.button")}
          </Button>
          <Button variant="danger-quiet" onClick={() => goTo("delete")}>
            {t("security.data.delete.button")}
          </Button>
        </div>
      )}

      {step === "download" && (
        <form onSubmit={submit} noValidate className={formStyles.stack}>
          <p>{t("security.data.download.confirmIdentity")}</p>
          {passwordField}
          <div className={formStyles.inlineActions}>
            <Button type="submit" isLoading={isBusy}>
              {t("security.data.download.submit")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => goTo("idle")}>
              {t("common.actions.cancel")}
            </Button>
          </div>
        </form>
      )}

      {step === "delete" && (
        <form onSubmit={submit} noValidate className={formStyles.stack}>
          <Notice tone="warning">{t("security.data.delete.warning")}</Notice>
          <p>{t("security.data.delete.confirmIdentity")}</p>
          {passwordField}
          {twoFactor.data?.enabled && (
            <TextField
              label={t("security.twoFactor.codeOrRecovery")}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              error={fieldErrors.code}
              required
            />
          )}
          <div className={formStyles.inlineActions}>
            <Button type="submit" variant="danger" isLoading={isBusy}>
              {t("security.data.delete.submit")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => goTo("idle")}>
              {t("common.actions.cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
