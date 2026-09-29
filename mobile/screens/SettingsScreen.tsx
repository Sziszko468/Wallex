import { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { useOffline } from "../hooks/useOffline";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { extractErrorMessage } from "../utils/errors";
import { Screen } from "../components/Screen";
import { colors, fontSize, radius, spacing } from "../utils/theme";

export function SettingsScreen() {
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

  const biometricLabel = biometricCapability?.label ?? "Biometrics";
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
    Alert.alert(
      "Log out of all devices?",
      "Every phone and browser signed in to your account is signed out, this one included.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log out everywhere", style: "destructive", onPress: () => void handleLogoutEverywhere() },
      ]
    );
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
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile</Text>
        <Row label="Email" value={user?.email} />
        <Row label="First name" value={user?.first_name || "—"} />
        <Row label="Last name" value={user?.last_name || "—"} />
        <Row
          label="Member since"
          value={user ? new Date(user.date_joined).toLocaleDateString() : "—"}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Currency</Text>
        <Row label="Base currency" value={user?.base_currency} />
        <Text style={styles.cardText}>
          Totals, budgets and recurring amounts are shown in this currency. You can change it in the Spendly web app.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notifications</Text>
        <Text style={styles.cardText}>Budget alerts, payment reminders and important insights.</Text>
        <Button
          title="Notification settings"
          variant="secondary"
          onPress={() => router.push("/notification-settings")}
        />
      </View>

      {isBiometricSupported && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Security</Text>
          <ErrorBanner message={lockError} />
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Unlock with {biometricLabel}</Text>
              <Text style={styles.switchHint}>
                {biometricCapability?.isAvailable
                  ? "Require it to open Spendly, and after 1 minute in the background."
                  : `Set up ${biometricLabel} in your device settings to use this.`}
              </Text>
            </View>
            <Switch
              accessibilityLabel={`Unlock with ${biometricLabel}`}
              value={isBiometricLockEnabled}
              onValueChange={handleBiometricToggle}
              disabled={isUpdatingLock || !biometricCapability?.isAvailable}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session</Text>
        <Text style={styles.cardText}>Log out of Spendly on this device.</Text>
        <ErrorBanner
          message={
            unsyncedCount > 0
              ? `${unsyncedCount} transaction${unsyncedCount === 1 ? " hasn't" : "s haven't"} been synced yet. Logging out now discards ${unsyncedCount === 1 ? "it" : "them"} — connect to the internet first to keep ${unsyncedCount === 1 ? "it" : "them"}.`
              : null
          }
        />
        <Button title="Log out" variant="danger" onPress={handleLogout} isLoading={isLoggingOut} />
        <Text style={[styles.cardText, styles.spaced]}>
          Lost a phone or signed in somewhere you shouldn&apos;t have? End every session at once.
        </Text>
        <ErrorBanner message={sessionError} />
        <Button
          title="Log out of all devices"
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
