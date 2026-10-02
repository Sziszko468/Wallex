import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { usePageTitle } from "../hooks/usePageTitle";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../utils/errors";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { ErrorBanner } from "../components/ErrorBanner";
import formStyles from "../components/form.module.scss";
import styles from "./AuthPages.module.scss";

export function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  usePageTitle(t("auth.register.title"));

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await register({
        email,
        password,
        password_confirm: passwordConfirm,
        first_name: firstName,
        last_name: lastName,
        language,
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setFieldErrors(extractFieldErrors(error));
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("auth.register.title")}</h1>
        <p className={styles.subtitle}>{t("auth.register.subtitle")}</p>
      </div>
      <ErrorBanner message={errorMessage} />
      <form onSubmit={handleSubmit} noValidate className={styles.stack}>
        <div className={formStyles.row}>
          <TextField
            label={t("auth.fields.firstName")}
            name="first_name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            error={fieldErrors.first_name}
          />
          <TextField
            label={t("auth.fields.lastName")}
            name="last_name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            error={fieldErrors.last_name}
          />
        </div>
        <TextField
          label={t("auth.fields.email")}
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
          required
        />
        <TextField
          label={t("auth.fields.password")}
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          required
        />
        <TextField
          label={t("auth.fields.confirmPassword")}
          type="password"
          name="password_confirm"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          error={fieldErrors.password_confirm}
          required
        />
        <Button type="submit" size="lg" fullWidth isLoading={isSubmitting}>
          {t("auth.register.submit")}
        </Button>
      </form>
      <p className={styles.switch}>
        {t("auth.register.haveAccount")} <Link to="/login">{t("auth.register.loginLink")}</Link>
      </p>
    </>
  );
}
