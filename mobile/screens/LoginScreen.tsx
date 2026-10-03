import { useState } from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { MFA_CODE_LENGTH } from "../config/security";
import { useAuth } from "../hooks/useAuth";
import { fontFamilies, makeStyles, space, useTheme } from "../theme";
import { extractErrorMessage } from "../utils/errors";
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

export function LoginScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
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
      <AuthFrame title={t("auth.mfa.title")} subtitle={t("auth.mfa.subtitle", { digits: MFA_CODE_LENGTH })}>
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
        <View style={styles.actions}>
          <Button title={t("auth.mfa.verify")} size="large" onPress={handleCode} isLoading={isSubmitting} />
          <Button
            title={t("auth.mfa.differentAccount")}
            variant="ghost"
            onPress={() => {
              setMfaToken(null);
              setCode("");
              setErrorMessage(null);
            }}
          />
        </View>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title={t("auth.login.title")}
      footer={
        <>
          <View style={styles.switch}>
            <Text variant="body" color="textSecondary">
              {t("auth.login.noAccount")}{" "}
            </Text>
            <Link href="/register" style={{ color: colors.primaryInk, fontFamily: fontFamilies.semibold, fontSize: 15, paddingVertical: space[3] }}>
              {t("auth.login.registerLink")}
            </Link>
          </View>
          <LanguageSelector />
        </>
      }
    >
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
      <View style={styles.actions}>
        <Button title={t("auth.login.submit")} size="large" onPress={handleSubmit} isLoading={isSubmitting} />
      </View>
    </AuthFrame>
  );
}
