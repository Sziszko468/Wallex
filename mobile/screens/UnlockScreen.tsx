import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { makeStyles, space } from "../theme";
import { AuthFrame } from "../components/auth/AuthFrame";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/ui/Button";

export function UnlockScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
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
    <AuthFrame title={t("auth.unlock.heading")} subtitle={t("auth.unlock.text", { method: label })} centered>
      <ErrorBanner message={errorMessage} />

      <View style={styles.actions}>
        {canRetry ? (
          <Button
            title={t("auth.unlock.unlockWith", { method: label })}
            icon="lock"
            size="large"
            onPress={handleUnlock}
            isLoading={isUnlocking}
            disabled={isUnlocking || isSigningOut}
          />
        ) : null}
        <Button
          title={t("auth.unlock.signInWithPassword")}
          variant="secondary"
          onPress={handleSignOut}
          isLoading={isSigningOut}
          disabled={isUnlocking || isSigningOut}
        />
      </View>
    </AuthFrame>
  );
}

const useStyles = makeStyles(() => ({
  actions: { gap: space[3] },
}));
