import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { MFA_CODE_LENGTH } from "../config/security";
import { useAuth } from "../hooks/useAuth";
import { usePageTitle } from "../hooks/usePageTitle";
import { extractErrorMessage } from "../utils/errors";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { ErrorBanner } from "../components/ErrorBanner";
import styles from "./AuthPages.module.scss";

export function LoginPage() {
  const { t } = useTranslation();
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set once the password was right but two-factor authentication needs a code.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageTitle(mfaToken ? t("auth.mfa.title") : t("auth.login.title"));

  async function run(step: () => Promise<void>) {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await step();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const outcome = await login({ email, password });
      if (outcome.status === "mfaRequired") {
        setMfaToken(outcome.mfaToken);
        setPassword("");
        return;
      }
      navigate("/dashboard", { replace: true });
    });
  }

  function handleCode(event: FormEvent) {
    event.preventDefault();
    if (!mfaToken) return;
    void run(async () => {
      await verifyMfa(mfaToken, code);
      navigate("/dashboard", { replace: true });
    });
  }

  function startOver() {
    setMfaToken(null);
    setCode("");
    setErrorMessage(null);
  }

  if (mfaToken) {
    return (
      <>
        <div className={styles.header}>
          <h1 className={styles.title}>{t("auth.mfa.title")}</h1>
          <p className={styles.subtitle}>{t("auth.mfa.subtitle", { digits: MFA_CODE_LENGTH })}</p>
        </div>
        <ErrorBanner message={errorMessage} />
        <form onSubmit={handleCode} noValidate className={styles.stack}>
          <TextField
            label={t("auth.mfa.code")}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
          <Button type="submit" size="lg" fullWidth isLoading={isSubmitting}>
            {t("auth.mfa.verify")}
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={startOver}>
            {t("auth.mfa.differentAccount")}
          </Button>
        </form>
      </>
    );
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("auth.login.title")}</h1>
        <p className={styles.subtitle}>{t("auth.login.subtitle")}</p>
      </div>
      <ErrorBanner message={errorMessage} />
      <form onSubmit={handlePassword} noValidate className={styles.stack}>
        <TextField
          label={t("auth.fields.email")}
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <TextField
          label={t("auth.fields.password")}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <Button type="submit" size="lg" fullWidth isLoading={isSubmitting}>
          {t("auth.login.submit")}
        </Button>
      </form>
      <p className={styles.switch}>
        {t("auth.login.noAccount")} <Link to="/register">{t("auth.login.registerLink")}</Link>
      </p>
    </>
  );
}
