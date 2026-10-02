import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BUDGET_NEAR_LIMIT_PERCENT } from "../config/budget";
import { useAsyncData } from "../hooks/useAsyncData";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import {
  disablePush,
  enablePush,
  isPushSupportedPlatform,
  syncPushRegistration,
  type PushStatus,
} from "../services/pushNotifications";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../services/notificationsService";
import { extractErrorMessage } from "../utils/errors";
import { colors, fontSize, radius, spacing } from "../utils/theme";
import type { NotificationPreferences, NotificationPreferencesUpdate } from "../types/notification";

type PreferenceToggle = Exclude<keyof NotificationPreferences, "recurring_reminder_days" | "updated_at">;

const REMINDER_DAY_OPTIONS = [1, 2, 3, 7];

export function NotificationSettingsScreen() {
  return (
    <Screen scroll>
      <DeviceSection />
      <PreferencesSection />
    </Screen>
  );
}

/** Push on *this* device: OS permission + registration with the backend. */
function DeviceSection() {
  const { t } = useTranslation();
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
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("settings.notificationSettings.device.title")}</Text>
        <Text style={styles.hint}>{t("settings.notificationSettings.device.unsupportedPlatform")}</Text>
      </View>
    );
  }

  const isEnabled = status?.state === "enabled";
  const canToggle = status !== null && status.state !== "unsupported" && !isUpdating;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("settings.notificationSettings.device.title")}</Text>
      <ErrorBanner message={error ?? (status?.state === "error" ? status.message : null)} />

      <ToggleRow
        label={t("settings.notificationSettings.device.push")}
        hint={t("settings.notificationSettings.device.pushHint")}
        value={isEnabled}
        onChange={handleToggle}
        disabled={!canToggle}
      />

      {status?.state === "denied" && (
        <View style={styles.notice}>
          <Text style={styles.hint}>
            {status.canAskAgain
              ? t("settings.notificationSettings.device.canAskAgain")
              : t("settings.notificationSettings.device.blocked")}
          </Text>
          {!status.canAskAgain && (
            <Button title={t("settings.notificationSettings.device.openSettings")} variant="secondary" onPress={() => void Linking.openSettings()} />
          )}
        </View>
      )}
      {status?.state === "unsupported" && <Text style={[styles.hint, styles.notice]}>{status.message}</Text>}
    </View>
  );
}

/** What to be notified about — stored on the backend, applies to all devices. */
function PreferencesSection() {
  const { t } = useTranslation();
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
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("settings.notificationSettings.preferences.title")}</Text>
      <Text style={[styles.hint, styles.subtitle]}>{t("settings.notificationSettings.preferences.subtitle")}</Text>
      <SectionState isLoading={loaded.isLoading} error={loaded.error} onRetry={loaded.refetch}>
        {preferences && (
          <>
            <ErrorBanner message={error} />
            {toggles.map(({ field, label, hint }) => (
              <ToggleRow
                key={field}
                label={label}
                hint={hint}
                value={preferences[field]}
                onChange={(value) => void update({ [field]: value })}
              />
            ))}

            {(preferences.subscription_reminders || preferences.recurring_reminders) && (
              <View style={styles.daysRow}>
                <Text style={styles.label}>{t("settings.notificationSettings.preferences.remind")}</Text>
                <View style={styles.chips}>
                  {REMINDER_DAY_OPTIONS.map((days) => {
                    const selected = preferences.recurring_reminder_days === days;
                    return (
                      <Pressable
                        key={days}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={t("settings.notificationSettings.preferences.daysBefore", { count: days })}
                        onPress={() => void update({ recurring_reminder_days: days })}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {t("settings.notificationSettings.preferences.days", { count: days })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.hint}>{t("settings.notificationSettings.preferences.after")}</Text>
              </View>
            )}
          </>
        )}
      </SectionState>
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, hint, value, onChange, disabled = false }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  subtitle: {
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  hint: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  notice: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  daysRow: {
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: colors.surface,
  },
});
