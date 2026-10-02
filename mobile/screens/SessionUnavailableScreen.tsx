import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { colors, fontSize, spacing } from "../utils/theme";

/**
 * Shown when a stored session exists but the backend couldn't be reached to
 * verify it. The session is kept, so a successful retry needs no new login.
 */
export function SessionUnavailableScreen() {
  const { t } = useTranslation();
  const { retry, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

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
        <Text style={styles.heading}>{t("auth.unavailable.heading")}</Text>
        <Text style={styles.text}>{t("auth.unavailable.text")}</Text>
        <Button title={t("auth.unavailable.tryAgain")} size="large" onPress={() => void retry()} disabled={isSigningOut} />
        <View style={styles.spacer} />
        <Button
          title={t("auth.unavailable.signOut")}
          variant="secondary"
          onPress={handleSignOut}
          isLoading={isSigningOut}
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
