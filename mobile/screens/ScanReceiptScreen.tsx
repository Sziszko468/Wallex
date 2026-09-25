import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAsyncData } from "../hooks/useAsyncData";
import { useCreateTransaction } from "../hooks/useCreateTransaction";
import { listCategories } from "../services/categoriesService";
import { scanReceipt } from "../services/receiptService";
import { extractErrorMessage } from "../utils/errors";
import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { SectionState } from "../components/SectionState";
import { ReceiptConfirmation, type ConfirmedReceipt } from "../components/receipts/ReceiptConfirmation";
import { colors, fontSize, radius, spacing } from "../utils/theme";
import type { ReceiptScan } from "../types/receipt";

const SUCCESS_DISMISS_DELAY_MS = 700;

type Step =
  | { kind: "capture" }
  | { kind: "processing"; photoUri: string }
  | { kind: "confirm"; photoUri: string; scan: ReceiptScan };

type PickerResult = ImagePicker.ImagePickerResult;

export function ScanReceiptScreen() {
  const [step, setStep] = useState<Step>({ kind: "capture" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const categories = useAsyncData(useCallback(() => listCategories(), []));
  const { create, isOffline } = useCreateTransaction();

  async function processPick(pick: () => Promise<PickerResult>) {
    setErrorMessage(null);
    let result: PickerResult;
    try {
      result = await pick();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
      return;
    }
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return; // the user closed the camera/library — stay here

    setStep({ kind: "processing", photoUri: asset.uri });
    try {
      const scan = await scanReceipt({ uri: asset.uri, width: asset.width });
      setStep({ kind: "confirm", photoUri: asset.uri, scan });
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
      setStep({ kind: "capture" });
    }
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCameraBlocked(!permission.canAskAgain);
      setErrorMessage("Spendly needs camera access to scan receipts.");
      return;
    }
    await processPick(() => ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 }));
  }

  async function handleChoosePhoto() {
    await processPick(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 }));
  }

  async function handleSave(receipt: ConfirmedReceipt) {
    const result = await create({
      type: "expense",
      amount: receipt.amount,
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
          <Text style={styles.muted}>Reading your receipt…</Text>
        </View>
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
      <Text style={styles.heading}>Scan a receipt</Text>
      <Text style={styles.muted}>
        Take a photo of the whole receipt, flat and well lit. You'll check every detail before anything is saved.
      </Text>
      <View style={styles.spacerLarge} />

      {!canScan && (
        <ErrorBanner message="You're offline. Scanning needs a connection — add the transaction manually instead." />
      )}
      <ErrorBanner message={errorMessage} />
      {cameraBlocked && Platform.OS !== "web" && (
        <>
          <Button title="Open settings" variant="secondary" onPress={() => void Linking.openSettings()} />
          <View style={styles.spacer} />
        </>
      )}

      <Button title="Take photo" size="large" onPress={handleTakePhoto} disabled={!canScan} />
      <View style={styles.spacer} />
      <Button title="Choose from library" variant="secondary" onPress={handleChoosePhoto} disabled={!canScan} />
      <View style={styles.spacerLarge} />
      <Button title="Enter manually instead" variant="secondary" onPress={() => router.replace("/add-transaction")} />
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
