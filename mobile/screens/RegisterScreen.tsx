import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { APP_NAME } from "../config/app";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../utils/errors";
import { Button } from "../components/Button";
import { LanguageSelector } from "../components/LanguageSelector";
import { TextField } from "../components/TextField";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { colors, fontSize, spacing } from "../utils/theme";

export function RegisterScreen() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const { language } = useLanguage();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit() {
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
      // No manual navigation: register() logs the user in, and the root
      // layout's guard switches to the (app) group automatically.
    } catch (error) {
      setFieldErrors(extractFieldErrors(error));
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.brand}>{APP_NAME}</Text>
      <Text style={styles.heading}>{t("auth.register.title")}</Text>
      <ErrorBanner message={errorMessage} />

      <TextField label={t("auth.fields.firstName")} autoComplete="name-given" value={firstName} onChangeText={setFirstName} error={fieldErrors.first_name} />
      <TextField label={t("auth.fields.lastName")} autoComplete="name-family" value={lastName} onChangeText={setLastName} error={fieldErrors.last_name} />
      <TextField
        label={t("auth.fields.email")}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
      />
      <TextField
        label={t("auth.fields.password")}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="password-new"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
      />
      <TextField
        label={t("auth.fields.confirmPassword")}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="password-new"
        value={passwordConfirm}
        onChangeText={setPasswordConfirm}
        error={fieldErrors.password_confirm}
      />
      <Button title={t("auth.register.submit")} onPress={handleSubmit} isLoading={isSubmitting} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t("auth.register.haveAccount")} </Text>
        <Link href="/login" style={styles.link}>
          {t("auth.register.loginLink")}
        </Link>
      </View>

      <View style={styles.language}>
        <LanguageSelector />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  heading: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  language: {
    marginTop: spacing.lg,
  },
  link: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
});
