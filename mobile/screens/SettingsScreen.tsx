import { useState, type ReactNode } from "react";
import { Alert, View } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { APP_NAME } from "../config/app";
import { LOCK_AFTER_BACKGROUND_MINUTES } from "../config/security";
import { useAuth } from "../hooks/useAuth";
import { useOffline } from "../hooks/useOffline";
import { makeStyles, space } from "../theme";
import { extractErrorMessage } from "../utils/errors";
import { formatFullDate } from "../utils/format";
import { Screen } from "../components/Screen";
import { LanguageSelector } from "../components/LanguageSelector";
import { ThemeSelector } from "../components/ThemeSelector";
import { AppSwitch } from "../components/ui/AppSwitch";
import { Avatar } from "../components/ui/Avatar";
import { Card } from "../components/ui/Card";
import { ListGroup, ListRow } from "../components/ui/ListRow";
import { Notice } from "../components/ui/Notice";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { Text } from "../components/ui/Text";

const useStyles = makeStyles(() => ({
  group: { marginTop: space[6], gap: space[3] },
  profile: { flexDirection: "row", alignItems: "center", gap: space[4] },
  profileText: { flex: 1, gap: 2 },
  controls: { gap: space[3] },
}));

/** "More": the shortcuts that don't earn a tab, then the settings — grouped, one thing per row. */
export function SettingsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
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

  // No manual navigation after logging out: the root layout's guard switches back to the
  // (auth) group automatically once the session is gone.
  function handleLogout() {
    void logout();
  }

  function confirmLogoutEverywhere() {
    Alert.alert(t("settings.session.logoutAll"), t("settings.session.logoutAllMessage"), [
      { text: t("common.actions.cancel"), style: "cancel" },
      { text: t("settings.session.logoutAllConfirm"), style: "destructive", onPress: () => void handleLogoutEverywhere() },
    ]);
  }

  async function handleLogoutEverywhere() {
    setSessionError(null);
    try {
      await logoutEverywhere();
    } catch (error) {
      setSessionError(extractErrorMessage(error));
    }
  }

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ");

  function renderGroup(title: string, children: ReactNode) {
    return (
      <View style={styles.group}>
        <Text variant="overline" color="textTertiary" header>
          {title}
        </Text>
        {children}
      </View>
    );
  }

  return (
    <Screen scroll edges={["left", "right"]}>
      <ScreenHeader title={t("settings.title")} />

      <Card padding={4}>
        <View style={styles.profile}>
          <Avatar firstName={user?.first_name} lastName={user?.last_name} email={user?.email} size={56} />
          <View style={styles.profileText}>
            <Text variant="heading" numberOfLines={1}>
              {fullName || user?.email}
            </Text>
            {fullName ? (
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {user?.email}
              </Text>
            ) : null}
            {user ? (
              <Text variant="caption" color="textTertiary">
                {t("settings.profile.memberSince")} {formatFullDate(user.date_joined)}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      {renderGroup(
        t("settings.tools.title"),
        <ListGroup>
          <ListRow icon="assistant" title={t("screens.assistant")} onPress={() => router.push("/assistant")} />
          <ListRow icon="recurring" title={t("screens.recurring")} onPress={() => router.push("/recurring")} />
          <ListRow icon="budgets" title={t("analytics.title")} onPress={() => router.push("/analytics")} />
        </ListGroup>
      )}

      {renderGroup(
        t("settings.appearance.title"),
        <Card padding={4}>
          <View style={styles.controls}>
            <Text variant="label" color="textSecondary">
              {t("settings.appearance.theme")}
            </Text>
            <ThemeSelector />
            <Text variant="caption" color="textTertiary">
              {t("settings.appearance.hint")}
            </Text>
          </View>
        </Card>
      )}

      {renderGroup(
        t("settings.language.title"),
        <Card padding={4}>
          <View style={styles.controls}>
            <LanguageSelector />
            <Text variant="caption" color="textTertiary">
              {t("settings.language.hint")}
            </Text>
          </View>
        </Card>
      )}

      {renderGroup(
        t("settings.currency.title"),
        <Card padding={4}>
          <View style={styles.controls}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="body" color="textSecondary">
                {t("settings.currency.base")}
              </Text>
              <Text variant="bodyStrong">{user?.base_currency}</Text>
            </View>
            <Text variant="caption" color="textTertiary">
              {t("settings.currency.hint")}
            </Text>
          </View>
        </Card>
      )}

      {renderGroup(
        t("settings.notifications.title"),
        <ListGroup>
          <ListRow icon="bell" title={t("settings.notifications.button")} subtitle={t("settings.notifications.hint")} onPress={() => router.push("/notification-settings")} />
        </ListGroup>
      )}

      {isBiometricSupported
        ? renderGroup(
            t("settings.security.title"),
            <>
              <Notice message={lockError} />
              <ListGroup>
                <ListRow
                  icon="lock"
                  title={t("settings.security.unlockWith", { method: biometricLabel })}
                  subtitle={
                    biometricCapability?.isAvailable
                      ? t("settings.security.requireHint", { count: LOCK_AFTER_BACKGROUND_MINUTES, appName: APP_NAME })
                      : t("settings.security.setupHint", { method: biometricLabel })
                  }
                  trailing={
                    <AppSwitch
                      accessibilityLabel={t("settings.security.unlockWith", { method: biometricLabel })}
                      value={isBiometricLockEnabled}
                      onValueChange={handleBiometricToggle}
                      disabled={isUpdatingLock || !biometricCapability?.isAvailable}
                    />
                  }
                />
              </ListGroup>
            </>
          )
        : null}

      {renderGroup(
        t("settings.data.title"),
        <ListGroup>
          <ListRow icon="file" title={t("settings.data.button")} subtitle={t("settings.data.hint", { appName: APP_NAME })} onPress={() => router.push("/account-data")} />
        </ListGroup>
      )}

      {renderGroup(
        t("settings.session.title"),
        <>
          <Notice tone="warning" message={unsyncedCount > 0 ? t("settings.session.unsynced", { count: unsyncedCount }) : null} />
          <Notice message={sessionError} />
          <ListGroup>
            <ListRow icon="log-out" title={t("settings.session.logout")} tone="danger" onPress={handleLogout} />
            <ListRow icon="smartphone" title={t("settings.session.logoutAll")} subtitle={t("settings.session.lostPhone")} tone="danger" onPress={confirmLogoutEverywhere} />
          </ListGroup>
        </>
      )}

      {renderGroup(
        t("settings.about.title"),
        <ListGroup>
          <ListRow icon="info" title={APP_NAME} subtitle={`${t("settings.about.version")} ${Constants.expoConfig?.version ?? ""}`.trim()} />
        </ListGroup>
      )}
    </Screen>
  );
}
