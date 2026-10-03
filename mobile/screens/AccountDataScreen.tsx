import { useCallback, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useAuth } from "../hooks/useAuth";
import { exportMyData, getMfaEnabled } from "../services/authService";
import { extractErrorMessage, extractFieldErrors } from "../utils/errors";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import { colors, fontSize, radius, spacing } from "../utils/theme";

type Step = "idle" | "download" | "delete";

/**
 * The person's rights over their data: share a copy of everything stored about them, or erase the
 * account for good (App Store and Play Store both require deleting an account inside the app).
 */
export function AccountDataScreen() {
  const { t } = useTranslation();
  const { deleteAccount } = useAuth();
  // With two-factor authentication on, erasing the account needs a code as well.
  const twoFactor = useAsyncData(useCallback(() => getMfaEnabled(), []));
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function goTo(next: Step) {
    setStep(next);
    setPassword("");
    setCode("");
    setErrorMessage(null);
    setFieldErrors({});
  }

  async function run(action: () => Promise<void>) {
    setErrorMessage(null);
    setFieldErrors({});
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      const fields = extractFieldErrors(error);
      setFieldErrors(fields);
      if (Object.keys(fields).length === 0) setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function handleDownload() {
    void run(async () => {
      const file = await exportMyData(password);
      await Share.share({ title: file.filename, message: file.text });
      goTo("idle");
    });
  }

  // No navigation after deleting: the root layout's guard returns to the sign-in screen by itself.
  function handleDelete() {
    void run(() => deleteAccount({ password, code: twoFactor.data ? code : undefined }));
  }

  const passwordField = (
    <TextField
      label={t("auth.fields.password")}
      secureTextEntry
      textContentType="password"
      autoComplete="password"
      value={password}
      onChangeText={setPassword}
      error={fieldErrors.password}
    />
  );

  return (
    <Screen scroll>
      <Text style={styles.heading}>{t("settings.data.title")}</Text>
      <Text style={styles.text}>{t("settings.data.hint")}</Text>
      <ErrorBanner message={errorMessage} />

      {step === "idle" && (
        <View style={styles.actions}>
          <Button title={t("settings.data.download.button")} variant="secondary" onPress={() => goTo("download")} />
          <Button title={t("settings.data.delete.button")} variant="danger" onPress={() => goTo("delete")} />
        </View>
      )}

      {step === "download" && (
        <>
          <Text style={styles.text}>{t("settings.data.download.confirmIdentity")}</Text>
          {passwordField}
          <View style={styles.actions}>
            <Button title={t("settings.data.download.submit")} onPress={handleDownload} isLoading={isBusy} />
            <Button title={t("common.actions.cancel")} variant="secondary" onPress={() => goTo("idle")} />
          </View>
        </>
      )}

      {step === "delete" && (
        <>
          <Text style={styles.warning}>{t("settings.data.delete.warning")}</Text>
          <Text style={styles.text}>{t("settings.data.delete.confirmIdentity")}</Text>
          {passwordField}
          {twoFactor.data && (
            <TextField
              label={t("settings.data.delete.code")}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              value={code}
              onChangeText={setCode}
              error={fieldErrors.code}
            />
          )}
          <View style={styles.actions}>
            <Button title={t("settings.data.delete.submit")} variant="danger" onPress={handleDelete} isLoading={isBusy} />
            <Button title={t("common.actions.cancel")} variant="secondary" onPress={() => goTo("idle")} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.sm,
  },
  heading: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  text: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  warning: {
    fontSize: fontSize.base,
    color: colors.danger,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
