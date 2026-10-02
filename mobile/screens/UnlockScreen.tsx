import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { APP_NAME } from "../config/app";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { colors, fontSize, spacing } from "../utils/theme";

export function UnlockScreen() {
  const { t } = useTranslation();
  const { unlock, logout, biometricCapability } = useAuth();
  const label = biometricCapability?.label ?? t("settings.biometrics.generic");

  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // After a lockout / removed biometrics, retrying the prompt can't succeed.
  const [canRetry, setCanRetry] = useState(true);

  const handleUnlock = useCallback(async () => {
    setErrorMessage(null);
    setIsUnlocking(true);
    try {
      const result = await unlock();
      // On success the root layout switches to the app — nothing to do here.
      if (!result.success) {
        setErrorMessage(result.message);
        setCanRetry(result.reason === "cancelled" || result.reason === "failed");
      }
    } finally {
      setIsUnlocking(false);
    }
  }, [unlock]);

  // Prompt right away once, like most banking apps; afterwards the button is
  // the way to try again (so a cancel doesn't loop the prompt forever).
  const hasPrompted = useRef(false);
  useEffect(() => {
    if (hasPrompted.current) return;
    hasPrompted.current = true;
    void handleUnlock();
  }, [handleUnlock]);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Text style={styles.heading}>{t("auth.unlock.heading")}</Text>
        <Text style={styles.text}>{t("auth.unlock.text", { method: label })}</Text>

        <ErrorBanner message={errorMessage} />

        {canRetry && (
          <Button
            title={t("auth.unlock.unlockWith", { method: label })}
            size="large"
            onPress={handleUnlock}
            isLoading={isUnlocking}
            disabled={isUnlocking || isSigningOut}
          />
        )}
        <View style={styles.spacer} />
        <Button
          title={t("auth.unlock.signInWithPassword")}
          variant="secondary"
          onPress={handleSignOut}
          isLoading={isSigningOut}
          disabled={isUnlocking || isSigningOut}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
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
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  text: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  spacer: {
    height: spacing.sm,
  },
});
