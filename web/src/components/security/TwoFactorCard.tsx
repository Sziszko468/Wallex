import { useCallback, useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  confirmMfa,
  disableMfa,
  getMfaStatus,
  regenerateRecoveryCodes,
  startMfaSetup,
} from "../../services/securityService";
import type { MfaSetup } from "../../types/security";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { formatDateTime } from "../../utils/format";
import { Button } from "../Button";
import { Card } from "../Card";
import { Notice } from "../Notice";
import formStyles from "../form.module.scss";
import { ErrorBanner } from "../ErrorBanner";
import { ErrorState } from "../ErrorState";
import { Skeleton } from "../Skeleton";
import { TextField } from "../TextField";
import styles from "./SecurityCards.module.scss";

type Step =
  | { name: "idle" }
  | { name: "setupPassword" }
  | { name: "setupCode"; setup: MfaSetup }
  | { name: "showCodes"; codes: string[] }
  | { name: "disable" }
  | { name: "regenerate" };

/** Groups a base32 key for reading and typing: "JBSW Y3DP EHPK …". */
function groupKey(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function TwoFactorCard() {
  const { t } = useTranslation();
  const status = useAsyncData(useCallback(() => getMfaStatus(), []));
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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
    if (step.name === "setupPassword") {
      void run(async () => goTo({ name: "setupCode", setup: await startMfaSetup(password) }));
    } else if (step.name === "setupCode") {
      void run(async () => {
        const { recovery_codes } = await confirmMfa(code);
        goTo({ name: "showCodes", codes: recovery_codes });
        await status.revalidate();
      });
    } else if (step.name === "disable") {
      void run(async () => {
        await disableMfa(password, code);
        goTo({ name: "idle" });
        await status.revalidate();
      });
    } else if (step.name === "regenerate") {
      void run(async () => {
        const { recovery_codes } = await regenerateRecoveryCodes(password, code);
        goTo({ name: "showCodes", codes: recovery_codes });
        await status.revalidate();
      });
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
  const codeField = (label: string) => (
    <TextField
      label={label}
      inputMode="numeric"
      autoComplete="one-time-code"
      value={code}
      onChange={(event) => setCode(event.target.value)}
      error={fieldErrors.code}
      required
    />
  );
  const cancel = (
    <Button type="button" variant="secondary" onClick={() => goTo({ name: "idle" })}>
      {t("common.actions.cancel")}
    </Button>
  );

  return (
    <Card padding="lg" className={styles.card}>
      <h2 className={styles.title}>{t("security.twoFactor.title")}</h2>
      <p className={styles.hint}>{t("security.twoFactor.hint")}</p>
      <ErrorBanner message={error} />

      {status.isLoading ? (
        <Skeleton height={40} />
      ) : status.error ? (
        <ErrorState error={status.error} onRetry={status.refetch} />
      ) : step.name === "showCodes" ? (
        <div className={styles.stack}>
          <p>
            <Trans i18nKey="security.twoFactor.codes.saveInstructions" components={{ strong: <strong /> }} />
          </p>
          <ul className={styles.codes} aria-label={t("security.twoFactor.codes.listLabel")}>
            {step.codes.map((recoveryCode) => (
              <li key={recoveryCode}>
                <code>{recoveryCode}</code>
              </li>
            ))}
          </ul>
          <Button onClick={() => goTo({ name: "idle" })}>{t("security.twoFactor.codes.saved")}</Button>
        </div>
      ) : step.name === "setupPassword" ? (
        <form onSubmit={submit} noValidate className={formStyles.stack}>
          <p>{t("security.twoFactor.confirmIdentity")}</p>
          {passwordField}
          <div className={formStyles.inlineActions}>
            <Button type="submit" isLoading={isBusy}>
              {t("security.twoFactor.continue")}
            </Button>
            {cancel}
          </div>
        </form>
      ) : step.name === "setupCode" ? (
        <form onSubmit={submit} noValidate className={formStyles.stack}>
          <p>
            <Trans
              i18nKey="security.twoFactor.setupInstructions"
              components={{ a: <a href={step.setup.otpauth_uri} /> }}
            />
          </p>
          <p className={styles.secret}>
            <code aria-label={t("security.twoFactor.setupKeyLabel")}>{groupKey(step.setup.secret)}</code>
          </p>
          {codeField(t("security.twoFactor.codeFromApp"))}
          <div className={formStyles.inlineActions}>
            <Button type="submit" isLoading={isBusy}>
              {t("security.twoFactor.turnOn")}
            </Button>
            {cancel}
          </div>
        </form>
      ) : step.name === "disable" || step.name === "regenerate" ? (
        <form onSubmit={submit} noValidate className={formStyles.stack}>
          <p>
            {step.name === "disable" ? t("security.twoFactor.turnOffWarning") : t("security.twoFactor.regenerateWarning")}
          </p>
          {passwordField}
          {codeField(t("security.twoFactor.codeOrRecovery"))}
          <div className={formStyles.inlineActions}>
            <Button type="submit" variant={step.name === "disable" ? "danger" : "primary"} isLoading={isBusy}>
              {step.name === "disable" ? t("security.twoFactor.turnOff") : t("security.twoFactor.createNewCodes")}
            </Button>
            {cancel}
          </div>
        </form>
      ) : status.data?.enabled ? (
        <div className={styles.stack}>
          <Notice tone="success">
            {t("security.twoFactor.status", {
              since: status.data.enabled_at ? formatDateTime(status.data.enabled_at) : t("common.states.notAvailable"),
              count: status.data.recovery_codes_left,
            })}
          </Notice>
          <div className={formStyles.inlineActions}>
            <Button variant="secondary" onClick={() => goTo({ name: "regenerate" })}>
              {t("security.twoFactor.newRecoveryCodes")}
            </Button>
            <Button variant="danger-quiet" onClick={() => goTo({ name: "disable" })}>
              {t("security.twoFactor.turnOff")}
            </Button>
          </div>
        </div>
      ) : (
        <Button leadingIcon="lock" onClick={() => goTo({ name: "setupPassword" })}>
          {t("security.twoFactor.enable")}
        </Button>
      )}
    </Card>
  );
}
