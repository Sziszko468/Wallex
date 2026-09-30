import { useCallback, useState, type FormEvent } from "react";
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
      label="Password"
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
      Cancel
    </Button>
  );

  return (
    <Card padding="lg" className={styles.card}>
      <h2 className={styles.title}>Two-factor authentication</h2>
      <p className={styles.hint}>
        Signing in also asks for a code from an authenticator app (Google Authenticator, Microsoft Authenticator,
        1Password…), so a stolen password alone isn&apos;t enough.
      </p>
      <ErrorBanner message={error} />

      {status.isLoading ? (
        <Skeleton height={40} />
      ) : status.error ? (
        <ErrorState error={status.error} onRetry={status.refetch} />
      ) : step.name === "showCodes" ? (
        <div className={styles.stack}>
          <p>
            <strong>Save these recovery codes</strong> somewhere safe (a password manager). Each one signs you in
            once if you lose your phone. They won&apos;t be shown again.
          </p>
          <ul className={styles.codes} aria-label="Recovery codes">
            {step.codes.map((recoveryCode) => (
              <li key={recoveryCode}>
                <code>{recoveryCode}</code>
              </li>
            ))}
          </ul>
          <Button onClick={() => goTo({ name: "idle" })}>I&apos;ve saved them</Button>
        </div>
      ) : step.name === "setupPassword" ? (
        <form onSubmit={submit} noValidate className={formStyles.stack}>
          <p>Confirm it&apos;s you to start the setup.</p>
          {passwordField}
          <div className={formStyles.inlineActions}>
            <Button type="submit" isLoading={isBusy}>
              Continue
            </Button>
            {cancel}
          </div>
        </form>
      ) : step.name === "setupCode" ? (
        <form onSubmit={submit} noValidate className={formStyles.stack}>
          <p>
            Add Spendly to your authenticator app: on your phone,{" "}
            <a href={step.setup.otpauth_uri}>open this setup link</a>, or type this key:
          </p>
          <p className={styles.secret}>
            <code aria-label="Setup key">{groupKey(step.setup.secret)}</code>
          </p>
          {codeField("Code from the app")}
          <div className={formStyles.inlineActions}>
            <Button type="submit" isLoading={isBusy}>
              Turn on
            </Button>
            {cancel}
          </div>
        </form>
      ) : step.name === "disable" || step.name === "regenerate" ? (
        <form onSubmit={submit} noValidate className={formStyles.stack}>
          <p>
            {step.name === "disable"
              ? "Turning it off makes your password the only thing protecting your account."
              : "New codes replace all your current recovery codes."}
          </p>
          {passwordField}
          {codeField("Authenticator or recovery code")}
          <div className={formStyles.inlineActions}>
            <Button type="submit" variant={step.name === "disable" ? "danger" : "primary"} isLoading={isBusy}>
              {step.name === "disable" ? "Turn off" : "Create new codes"}
            </Button>
            {cancel}
          </div>
        </form>
      ) : status.data?.enabled ? (
        <div className={styles.stack}>
          <Notice tone="success">
            On since {status.data.enabled_at ? formatDateTime(status.data.enabled_at) : "—"} ·{" "}
            {status.data.recovery_codes_left} recovery code{status.data.recovery_codes_left === 1 ? "" : "s"} left
          </Notice>
          <div className={formStyles.inlineActions}>
            <Button variant="secondary" onClick={() => goTo({ name: "regenerate" })}>
              New recovery codes
            </Button>
            <Button variant="danger-quiet" onClick={() => goTo({ name: "disable" })}>
              Turn off
            </Button>
          </div>
        </div>
      ) : (
        <Button leadingIcon="lock" onClick={() => goTo({ name: "setupPassword" })}>
          Turn on two-factor authentication
        </Button>
      )}
    </Card>
  );
}
