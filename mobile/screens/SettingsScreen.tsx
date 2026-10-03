import { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { APP_NAME } from "../config/app";
import { LOCK_AFTER_BACKGROUND_MINUTES } from "../config/security";
import { useAuth } from "../hooks/useAuth";
import { useOffline } from "../hooks/useOffline";
import { Button } from "../components/Button";
import { LanguageSelector } from "../components/LanguageSelector";
import { ErrorBanner } from "../components/ErrorBanner";
import { extractErrorMessage } from "../utils/errors";
import { formatFullDate } from "../utils/format";
import { Screen } from "../components/Screen";
import { colors, fontSize, radius, spacing } from "../utils/theme";

export function SettingsScreen() {
  const { t } = useTranslation();
  const {
    user,
    logout,
    logoutEverywhere,
    biometricCapability,
    isBiometricLockEnabled,
    enableBiometricLock,
    disableBiometricLock,
  } = useAuth();
  const { pendingTransactions } = useOffline();
  const unsyncedCount = pendingTransactions.length;
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggingOutEverywhere, setIsLoggingOutEverywhere] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isUpdatingLock, setIsUpdatingLock] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const biometricLabel = biometricCapability?.label ?? t("settings.biometrics.generic");
  const isBiometricSupported =
    biometricCapability !== null &&
    (biometricCapability.isAvailable || biometricCapability.reason !== "unsupported_platform");

  async function handleBiometricToggle(enabled: boolean) {
    setLockError(null);
    setIsUpdatingLock(true);
    try {
      if (enabled) {
        const result = await enableBiometricLock();
        if (!result.success) setLockError(result.message);
      } else {
        await disableBiometricLock();
      }
    } catch (error) {
      setLockError(extractErrorMessage(error));
    } finally {
      setIsUpdatingLock(false);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      // No manual navigation: the root layout's guard switches back to the
      // (auth) group automatically once isAuthenticated flips to false.
    } finally {
      setIsLoggingOut(false);
    }
  }

  function confirmLogoutEverywhere() {
    Alert.alert(t("settings.session.logoutAll"), t("settings.session.logoutAllMessage"), [
      { text: t("common.actions.cancel"), style: "cancel" },
      { text: t("settings.session.logoutAllConfirm"), style: "destructive", onPress: () => void handleLogoutEverywhere() },
    ]);
  }

  async function handleLogoutEverywhere() {
    setSessionError(null);
    setIsLoggingOutEverywhere(true);
    try {
      await logoutEverywhere();
    } catch (error) {
      setSessionError(extractErrorMessage(error));
      setIsLoggingOutEverywhere(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.heading}>{t("settings.title")}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("settings.profile.title")}</Text>
        <Row label={t("settings.profile.email")} value={user?.email} />
        <Row label={t("settings.profile.firstName")} value={user?.first_name || t("common.states.notAvailable")} />
        <Row label={t("settings.profile.lastName")} value={user?.last_name || t("common.states.notAvailable")} />
        <Row
          label={t("settings.profile.memberSince")}
          value={user ? formatFullDate(user.date_joined) : t("common.states.notAvailable")}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("settings.language.title")}</Text>
        <Text style={styles.cardText}>{t("settings.language.hint")}</Text>
        <LanguageSelector />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("settings.currency.title")}</Text>
        <Row label={t("settings.currency.base")} value={user?.base_currency} />
        <Text style={styles.cardText}>{t("settings.currency.hint")}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("settings.notifications.title")}</Text>
        <Text style={styles.cardText}>{t("settings.notifications.hint")}</Text>
        <Button
          title={t("settings.notifications.button")}
          variant="secondary"
          onPress={() => router.push("/notification-settings")}
        />
      </View>

      {isBiometricSupported && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("settings.security.title")}</Text>
          <ErrorBanner message={lockError} />
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>{t("settings.security.unlockWith", { method: biometricLabel })}</Text>
              <Text style={styles.switchHint}>
                {biometricCapability?.isAvailable
                  ? t("settings.security.requireHint", { count: LOCK_AFTER_BACKGROUND_MINUTES, appName: APP_NAME })
                  : t("settings.security.setupHint", { method: biometricLabel })}
              </Text>
            </View>
            <Switch
              accessibilityLabel={t("settings.security.unlockWith", { method: biometricLabel })}
              value={isBiometricLockEnabled}
              onValueChange={handleBiometricToggle}
              disabled={isUpdatingLock || !biometricCapability?.isAvailable}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("settings.data.title")}</Text>
        <Text style={styles.cardText}>{t("settings.data.hint")}</Text>
        <Button title={t("settings.data.button")} variant="secondary" onPress={() => router.push("/account-data")} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("settings.session.title")}</Text>
        <Text style={styles.cardText}>{t("settings.session.hint")}</Text>
        <ErrorBanner
          message={unsyncedCount > 0 ? t("settings.session.unsynced", { count: unsyncedCount }) : null}
        />
        <Button title={t("settings.session.logout")} variant="danger" onPress={handleLogout} isLoading={isLoggingOut} />
        <Text style={[styles.cardText, styles.spaced]}>{t("settings.session.lostPhone")}</Text>
        <ErrorBanner message={sessionError} />
        <Button
          title={t("settings.session.logoutAll")}
          variant="secondary"
          onPress={confirmLogoutEverywhere}
          isLoading={isLoggingOutEverywhere}
        />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  cardText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  spaced: {
    marginTop: spacing.lg,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  switchText: {
    flex: 1,
  },
  switchLabel: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  switchHint: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  rowValue: {
    color: colors.text,
    fontWeight: "600",
    fontSize: fontSize.sm,
  },
});
