import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { colors, fontSize, radius, spacing } from "../utils/theme";

export function SettingsScreen() {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  return (
    <Screen>
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
        <Text style={styles.cardTitle}>Session</Text>
        <Text style={styles.cardText}>Log out of Spendly on this device.</Text>
        <Button title="Log out" variant="danger" onPress={handleLogout} isLoading={isLoggingOut} />
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
