import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { APP_NAME } from "../config/app";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { useCreateTransaction } from "../hooks/useCreateTransaction";
import { listCategories } from "../services/categoriesService";
import { scanReceipt } from "../services/receiptService";
import { extractErrorMessage } from "../utils/errors";
import { problemFromError, problemFromScan, type ProblemAction, type ScanProblem } from "../utils/receiptProblems";
import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { SectionState } from "../components/SectionState";
import { ReceiptConfirmation, type ConfirmedReceipt } from "../components/receipts/ReceiptConfirmation";
import { ScanProblemPanel } from "../components/receipts/ScanProblemPanel";
import { colors, fontSize, radius, spacing } from "../utils/theme";
import type { ReceiptScan } from "../types/receipt";

const SUCCESS_DISMISS_DELAY_MS = 700;

/**
 * capture → processing → confirm → (Save) → the transaction.
 * A scan that can't be reviewed ends in `problem` instead. Only the confirm step's
 * Save button ever creates a transaction — a scan on its own never does.
 */
type Step =
  | { kind: "capture" }
  | { kind: "processing"; photoUri: string }
  | { kind: "problem"; problem: ScanProblem; photoUri?: string; scan?: ReceiptScan }
  | { kind: "confirm"; photoUri: string; scan: ReceiptScan };

type PickerResult = ImagePicker.ImagePickerResult;

export function ScanReceiptScreen() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ kind: "capture" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const categories = useAsyncData(useCallback(() => listCategories(), []));
  const baseCurrency = useBaseCurrency();
  const { create, isOffline } = useCreateTransaction();

  async function processPick(pick: () => Promise<PickerResult>) {
    setErrorMessage(null);
    let result: PickerResult;
    try {
      result = await pick();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
      setStep({ kind: "capture" });
      return;
    }
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return; // the user closed the camera/library — stay where we were

    setStep({ kind: "processing", photoUri: asset.uri });
    try {
      const scan = await scanReceipt({ uri: asset.uri, width: asset.width });
      const problem = problemFromScan(scan);
      setStep(
        problem
          ? { kind: "problem", problem, photoUri: asset.uri, scan }
          : { kind: "confirm", photoUri: asset.uri, scan }
      );
    } catch (error) {
      setStep({ kind: "problem", problem: problemFromError(error), photoUri: asset.uri });
    }
  }

  function handleProblemAction(action: ProblemAction) {
    if (action === "retake") void handleTakePhoto();
    else if (action === "library") void handleChoosePhoto();
    else if (action === "manual") router.replace("/add-transaction");
    else if (step.kind === "problem" && step.scan && step.photoUri) {
      setStep({ kind: "confirm", photoUri: step.photoUri, scan: step.scan });
    }
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCameraBlocked(!permission.canAskAgain);
      setErrorMessage(t("receipts.scan.cameraNeeded", { appName: APP_NAME }));
      return;
    }
    await processPick(() => ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 }));
  }

  async function handleChoosePhoto() {
    await processPick(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 }));
  }

  async function handleSave(receipt: ConfirmedReceipt) {
    // The same Transaction API (and offline outbox) as the manual form.
    const result = await create({
      type: "expense",
      amount: receipt.amount,
      currency: receipt.currency,
      category: receipt.category,
      description: receipt.merchant,
      date: receipt.date,
    });
    setTimeout(() => router.back(), SUCCESS_DISMISS_DELAY_MS);
    return result;
  }

  if (step.kind === "processing") {
    return (
      <Screen>
        <View style={styles.center}>
          <Image source={{ uri: step.photoUri }} style={styles.preview} resizeMode="contain" />
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t("receipts.scan.reading")}</Text>
        </View>
      </Screen>
    );
  }

  if (step.kind === "problem") {
    return (
      <Screen scroll>
        <ScanProblemPanel problem={step.problem} photoUri={step.photoUri} onAction={handleProblemAction} />
      </Screen>
    );
  }

  if (step.kind === "confirm") {
    return (
      <Screen scroll>
        <Image source={{ uri: step.photoUri }} style={styles.thumbnail} resizeMode="contain" />
        <SectionState isLoading={categories.isLoading} error={categories.error} onRetry={categories.refetch}>
          {categories.data && (
            <ReceiptConfirmation
              scan={step.scan}
              categories={categories.data}
              baseCurrency={baseCurrency}
              isOffline={isOffline}
              onSave={handleSave}
              onRetake={() => setStep({ kind: "capture" })}
            />
          )}
        </SectionState>
      </Screen>
    );
  }

  // Reading the receipt happens on the server, so scanning needs a connection.
  const canScan = !isOffline;
  return (
    <Screen>
      <Text style={styles.heading}>{t("receipts.scan.title")}</Text>
      <Text style={styles.muted}>{t("receipts.scan.intro")}</Text>
      <View style={styles.spacerLarge} />

      {!canScan && (
        <ErrorBanner message={t("receipts.scan.offline")} />
      )}
      <ErrorBanner message={errorMessage} />
      {cameraBlocked && Platform.OS !== "web" && (
        <>
          <Button title={t("receipts.scan.openSettings")} variant="secondary" onPress={() => void Linking.openSettings()} />
          <View style={styles.spacer} />
        </>
      )}

      <Button title={t("receipts.scan.takePhoto")} size="large" onPress={handleTakePhoto} disabled={!canScan} />
      <View style={styles.spacer} />
      <Button title={t("receipts.scan.choose")} variant="secondary" onPress={handleChoosePhoto} disabled={!canScan} />
      <View style={styles.spacerLarge} />
      <Button title={t("receipts.scan.manual")} variant="secondary" onPress={() => router.replace("/add-transaction")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  muted: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "left",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  preview: {
    width: "100%",
    height: 320,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  thumbnail: {
    width: "100%",
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  spacer: {
    height: spacing.sm,
  },
  spacerLarge: {
    height: spacing.lg,
  },
});
