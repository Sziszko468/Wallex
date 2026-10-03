import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BUDGET_NEAR_LIMIT_PERCENT } from "../config/budget";
import { useAsyncData } from "../hooks/useAsyncData";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import { AppSwitch } from "../components/ui/AppSwitch";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ListGroup, ListRow } from "../components/ui/ListRow";
import { Notice } from "../components/ui/Notice";
import { Text } from "../components/ui/Text";
import {
  disablePush,
  enablePush,
  isPushSupportedPlatform,
  syncPushRegistration,
  type PushStatus,
} from "../services/pushNotifications";
import { getNotificationPreferences, updateNotificationPreferences } from "../services/notificationsService";
import { extractErrorMessage } from "../utils/errors";
import { layout, makeStyles, radius, space } from "../theme";
import type { NotificationPreferences, NotificationPreferencesUpdate } from "../types/notification";

type PreferenceToggle = Exclude<keyof NotificationPreferences, "recurring_reminder_days" | "updated_at">;

const REMINDER_DAY_OPTIONS = [1, 2, 3, 7];

const useStyles = makeStyles(({ colors }) => ({
  section: { gap: space[3], marginBottom: space[6] },
  notice: { gap: space[3], marginTop: space[3] },
  days: { gap: space[3] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  chip: {
    minHeight: layout.minTouch,
    paddingHorizontal: space[4],
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
}));

export function NotificationSettingsScreen() {
  return (
    <Screen scroll contentStyle={{ paddingTop: space[3] }}>
      <DeviceSection />
      <PreferencesSection />
    </Screen>
  );
}

/** Push on *this* device: OS permission + registration with the backend. */
function DeviceSection() {
  const { t } = useTranslation();
  const styles = useStyles();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatus(await syncPushRegistration({ askPermission: false }));
  }, []);

  useEffect(() => {
    void refreshStatus();
    // Coming back from the system settings (where permission may have changed).
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshStatus();
    });
    return () => subscription.remove();
  }, [refreshStatus]);

  async function handleToggle(enabled: boolean) {
    setError(null);
    setIsUpdating(true);
    try {
      if (enabled) {
        setStatus(await enablePush());
      } else {
        await disablePush();
        setStatus({ state: "disabled" });
      }
    } catch (toggleError) {
      setError(extractErrorMessage(toggleError));
    } finally {
      setIsUpdating(false);
    }
  }

  if (!isPushSupportedPlatform) {
    return (
      <View style={styles.section}>
        <Text variant="heading" header>
          {t("settings.notificationSettings.device.title")}
        </Text>
        <Notice tone="info" message={t("settings.notificationSettings.device.unsupportedPlatform")} />
      </View>
    );
  }

  const isEnabled = status?.state === "enabled";
  const canToggle = status !== null && status.state !== "unsupported" && !isUpdating;

  return (
    <View style={styles.section}>
      <Text variant="heading" header>
        {t("settings.notificationSettings.device.title")}
      </Text>
      <Notice message={error ?? (status?.state === "error" ? status.message : null)} />

      <ListGroup hasIcons={false}>
        <ListRow
          title={t("settings.notificationSettings.device.push")}
          subtitle={t("settings.notificationSettings.device.pushHint")}
          trailing={<AppSwitch accessibilityLabel={t("settings.notificationSettings.device.push")} value={isEnabled} onValueChange={(value) => void handleToggle(value)} disabled={!canToggle} />}
        />
      </ListGroup>

      {status?.state === "denied" ? (
        <View style={styles.notice}>
          <Notice
            tone="warning"
            message={status.canAskAgain ? t("settings.notificationSettings.device.canAskAgain") : t("settings.notificationSettings.device.blocked")}
          />
          {!status.canAskAgain ? <Button title={t("settings.notificationSettings.device.openSettings")} variant="secondary" onPress={() => void Linking.openSettings()} /> : null}
        </View>
      ) : null}
      {status?.state === "unsupported" ? <Notice tone="info" message={status.message} /> : null}
    </View>
  );
}

/** What to be notified about — stored on the backend, applies to all devices. */
function PreferencesSection() {
  const { t } = useTranslation();
  const styles = useStyles();
  const loaded = useAsyncData(useCallback(() => getNotificationPreferences(), []));
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded.data) setPreferences(loaded.data);
  }, [loaded.data]);

  // Only labels live here: when to notify, and what the notification says, is decided by the backend.
  const toggles: { field: PreferenceToggle; label: string; hint: string }[] = [
    {
      field: "budget_warnings",
      label: t("settings.notificationSettings.toggles.budget_warnings.label"),
      hint: t("settings.notificationSettings.toggles.budget_warnings.hint", { percent: BUDGET_NEAR_LIMIT_PERCENT }),
    },
    {
      field: "budget_exceeded",
      label: t("settings.notificationSettings.toggles.budget_exceeded.label"),
      hint: t("settings.notificationSettings.toggles.budget_exceeded.hint"),
    },
    {
      field: "subscription_reminders",
      label: t("settings.notificationSettings.toggles.subscription_reminders.label"),
      hint: t("settings.notificationSettings.toggles.subscription_reminders.hint"),
    },
    {
      field: "recurring_reminders",
      label: t("settings.notificationSettings.toggles.recurring_reminders.label"),
      hint: t("settings.notificationSettings.toggles.recurring_reminders.hint"),
    },
    {
      field: "savings_goals",
      label: t("settings.notificationSettings.toggles.savings_goals.label"),
      hint: t("settings.notificationSettings.toggles.savings_goals.hint"),
    },
    {
      field: "unusual_spending",
      label: t("settings.notificationSettings.toggles.unusual_spending.label"),
      hint: t("settings.notificationSettings.toggles.unusual_spending.hint"),
    },
    {
      field: "monthly_summary",
      label: t("settings.notificationSettings.toggles.monthly_summary.label"),
      hint: t("settings.notificationSettings.toggles.monthly_summary.hint"),
    },
    {
      field: "insights",
      label: t("settings.notificationSettings.toggles.insights.label"),
      hint: t("settings.notificationSettings.toggles.insights.hint"),
    },
  ];

  async function update(patch: NotificationPreferencesUpdate) {
    if (!preferences) return;
    const previous = preferences;
    setError(null);
    setPreferences({ ...preferences, ...patch }); // optimistic
    try {
      setPreferences(await updateNotificationPreferences(patch));
    } catch (updateError) {
      setPreferences(previous);
      setError(extractErrorMessage(updateError));
    }
  }

  return (
    <View style={styles.section}>
      <View>
        <Text variant="heading" header>
          {t("settings.notificationSettings.preferences.title")}
        </Text>
        <Text variant="caption" color="textSecondary">
          {t("settings.notificationSettings.preferences.subtitle")}
        </Text>
      </View>
      <SectionState isLoading={loaded.isLoading} error={loaded.error} onRetry={loaded.refetch}>
        {preferences ? (
          <>
            <Notice message={error} />
            <ListGroup hasIcons={false}>
              {toggles.map(({ field, label, hint }) => (
                <ListRow
                  key={field}
                  title={label}
                  subtitle={hint}
                  trailing={<AppSwitch accessibilityLabel={label} value={preferences[field]} onValueChange={(value) => void update({ [field]: value })} />}
                />
              ))}
            </ListGroup>

            {preferences.subscription_reminders || preferences.recurring_reminders ? (
              <Card padding={4}>
                <View style={styles.days}>
                  <Text variant="label" color="textSecondary">
                    {t("settings.notificationSettings.preferences.remind")}
                  </Text>
                  <View style={styles.chips} accessibilityRole="radiogroup">
                    {REMINDER_DAY_OPTIONS.map((days) => {
                      const selected = preferences.recurring_reminder_days === days;
                      return (
                        <Pressable
                          key={days}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected, selected }}
                          accessibilityLabel={t("settings.notificationSettings.preferences.daysBefore", { count: days })}
                          onPress={() => void update({ recurring_reminder_days: days })}
                          style={[styles.chip, selected && styles.chipSelected]}
                        >
                          <Text variant="label" color={selected ? "primaryInk" : "textSecondary"}>
                            {t("settings.notificationSettings.preferences.days", { count: days })}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text variant="caption" color="textSecondary">
                    {t("settings.notificationSettings.preferences.after")}
                  </Text>
                </View>
              </Card>
            ) : null}
          </>
        ) : null}
      </SectionState>
    </View>
  );
}
