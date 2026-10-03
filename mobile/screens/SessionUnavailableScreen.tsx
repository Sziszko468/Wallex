import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { makeStyles, space } from "../theme";
import { AuthFrame } from "../components/auth/AuthFrame";
import { Button } from "../components/ui/Button";

const useStyles = makeStyles(() => ({
  actions: { gap: space[3] },
}));

/**
 * Shown when a stored session exists but the backend couldn't be reached to
 * verify it. The session is kept, so a successful retry needs no new login.
 */
export function SessionUnavailableScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
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
    <AuthFrame title={t("auth.unavailable.heading")} subtitle={t("auth.unavailable.text")} centered>
      <View style={styles.actions}>
        <Button title={t("auth.unavailable.tryAgain")} icon="refresh" size="large" onPress={() => void retry()} disabled={isSigningOut} />
        <Button title={t("auth.unavailable.signOut")} variant="secondary" onPress={handleSignOut} isLoading={isSigningOut} />
      </View>
    </AuthFrame>
  );
}
