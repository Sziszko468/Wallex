import { useCallback, useState } from "react";
import { Share, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useAuth } from "../hooks/useAuth";
import { exportMyData, getMfaEnabled } from "../services/authService";
import { makeStyles, space } from "../theme";
import { extractErrorMessage, extractFieldErrors } from "../utils/errors";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { Text } from "../components/ui/Text";
import { TextField } from "../components/ui/TextField";

type Step = "idle" | "download" | "delete";

const useStyles = makeStyles(() => ({
  intro: { gap: space[2], marginBottom: space[5] },
  actions: { gap: space[3], marginTop: space[2] },
}));

/**
 * The person's rights over their data: share a copy of everything stored about them, or erase the
 * account for good (App Store and Play Store both require deleting an account inside the app).
 */
export function AccountDataScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
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
    <Screen scroll contentStyle={{ paddingTop: space[3] }}>
      <View style={styles.intro}>
        <Text variant="title" header>
          {t("settings.data.title")}
        </Text>
        <Text variant="body" color="textSecondary">
          {t("settings.data.hint")}
        </Text>
      </View>
      <ErrorBanner message={errorMessage} />

      {step === "idle" ? (
        <View style={styles.actions}>
          <Button title={t("settings.data.download.button")} variant="secondary" icon="upload" onPress={() => goTo("download")} />
          <Button title={t("settings.data.delete.button")} variant="dangerSoft" icon="trash" onPress={() => goTo("delete")} />
        </View>
      ) : null}

      {step === "download" ? (
        <>
          <Text variant="body" color="textSecondary" style={{ marginBottom: space[4] }}>
            {t("settings.data.download.confirmIdentity")}
          </Text>
          {passwordField}
          <View style={styles.actions}>
            <Button title={t("settings.data.download.submit")} onPress={handleDownload} isLoading={isBusy} />
            <Button title={t("common.actions.cancel")} variant="ghost" onPress={() => goTo("idle")} />
          </View>
        </>
      ) : null}

      {step === "delete" ? (
        <>
          <Notice message={t("settings.data.delete.warning")} />
          <Text variant="body" color="textSecondary" style={{ marginBottom: space[4] }}>
            {t("settings.data.delete.confirmIdentity")}
          </Text>
          {passwordField}
          {twoFactor.data ? (
            <TextField
              label={t("settings.data.delete.code")}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              value={code}
              onChangeText={setCode}
              error={fieldErrors.code}
            />
          ) : null}
          <View style={styles.actions}>
            <Button title={t("settings.data.delete.submit")} variant="danger" onPress={handleDelete} isLoading={isBusy} />
            <Button title={t("common.actions.cancel")} variant="ghost" onPress={() => goTo("idle")} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
