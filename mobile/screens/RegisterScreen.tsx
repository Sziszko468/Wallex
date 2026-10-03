import { useState } from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { fontFamilies, makeStyles, space, useTheme } from "../theme";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../utils/errors";
import { AuthFrame } from "../components/auth/AuthFrame";
import { LanguageSelector } from "../components/LanguageSelector";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/ui/Button";
import { Text } from "../components/ui/Text";
import { TextField } from "../components/ui/TextField";

const useStyles = makeStyles(() => ({
  actions: { gap: space[3], marginTop: space[2] },
  switch: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", minHeight: 44 },
}));

export function RegisterScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
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
    <AuthFrame
      title={t("auth.register.title")}
      footer={
        <>
          <View style={styles.switch}>
            <Text variant="body" color="textSecondary">
              {t("auth.register.haveAccount")}{" "}
            </Text>
            <Link href="/login" style={{ color: colors.primaryInk, fontFamily: fontFamilies.semibold, fontSize: 15, paddingVertical: space[3] }}>
              {t("auth.register.loginLink")}
            </Link>
          </View>
          <LanguageSelector />
        </>
      }
    >
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
      <View style={styles.actions}>
        <Button title={t("auth.register.submit")} size="large" onPress={handleSubmit} isLoading={isSubmitting} />
      </View>
    </AuthFrame>
  );
}
