import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { APP_NAME } from "../config/app";
import { MFA_CODE_LENGTH } from "../config/security";
import { useAuth } from "../hooks/useAuth";
import { extractErrorMessage } from "../utils/errors";
import { Button } from "../components/Button";
import { LanguageSelector } from "../components/LanguageSelector";
import { TextField } from "../components/TextField";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { colors, fontSize, spacing } from "../utils/theme";

export function LoginScreen() {
  const { t } = useTranslation();
  const { login, verifyMfa, signOutReason } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set once the password was right but two-factor authentication needs a code.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // No manual navigation after signing in: the root layout's Stack.Protected guard
  // switches to the (app) group automatically once isAuthenticated flips.
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

  function handleSubmit() {
    void run(async () => {
      const outcome = await login({ email, password });
      if (outcome.status === "mfaRequired") {
        setMfaToken(outcome.mfaToken);
        setPassword("");
      }
    });
  }

  function handleCode() {
    if (mfaToken) void run(() => verifyMfa(mfaToken, code));
  }

  if (mfaToken) {
    return (
      <Screen scroll>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Text style={styles.heading}>{t("auth.mfa.title")}</Text>
        <Text style={styles.hint}>{t("auth.mfa.subtitle", { digits: MFA_CODE_LENGTH })}</Text>
        <ErrorBanner message={errorMessage} />
        <TextField
          label={t("auth.mfa.code")}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChangeText={setCode}
        />
        <Button title={t("auth.mfa.verify")} onPress={handleCode} isLoading={isSubmitting} />
        <Button
          title={t("auth.mfa.differentAccount")}
          variant="secondary"
          onPress={() => {
            setMfaToken(null);
            setCode("");
            setErrorMessage(null);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={styles.brand}>{APP_NAME}</Text>
      <Text style={styles.heading}>{t("auth.login.title")}</Text>
      <ErrorBanner message={errorMessage ?? (signOutReason ? t(`auth.notices.${signOutReason}`) : null)} />

      <TextField
        label={t("auth.fields.email")}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        label={t("auth.fields.password")}
        secureTextEntry
        textContentType="password"
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
      />
      <Button title={t("auth.login.submit")} onPress={handleSubmit} isLoading={isSubmitting} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t("auth.login.noAccount")} </Text>
        <Link href="/register" style={styles.link}>
          {t("auth.login.registerLink")}
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
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
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
