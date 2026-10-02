import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOffline } from "../hooks/useOffline";
import { formatDateTime } from "../utils/format";
import { colors, fontSize, spacing } from "../utils/theme";

interface BannerContent {
  tone: "offline" | "info" | "danger";
  message: string;
  action?: { label: string; onPress: () => void };
}

/** Top-of-app status line: offline state, cached data age, and sync progress/problems. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const { isOffline, cacheServedAt, pendingCount, failedCount, isSyncing, syncNow } = useOffline();
  const content = getContent();
  if (!content) return null;

  function getContent(): BannerContent | null {
    if (isOffline) {
      const saved = cacheServedAt
        ? t("offline.banner.savedAt", { time: formatDateTime(cacheServedAt) })
        : t("offline.banner.savedGeneric");
      const waiting = pendingCount > 0 ? t("offline.banner.waiting", { count: pendingCount }) : "";
      return { tone: "offline", message: t("offline.banner.offline", { saved, waiting }) };
    }
    if (failedCount > 0) {
      return {
        tone: "danger",
        message: t("offline.banner.failed", { count: failedCount }),
        action: { label: t("offline.banner.review"), onPress: () => router.push("/transactions") },
      };
    }
    if (isSyncing && pendingCount > 0) {
      return { tone: "info", message: t("offline.banner.syncing", { count: pendingCount }) };
    }
    if (pendingCount > 0) {
      return {
        tone: "info",
        message: t("offline.banner.pending", { count: pendingCount }),
        action: { label: t("offline.banner.syncNow"), onPress: () => void syncNow() },
      };
    }
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, styles[content.tone]]}
    >
      <Text style={styles.message}>{content.message}</Text>
      {content.action && (
        <Pressable accessibilityRole="button" onPress={content.action.onPress} hitSlop={8} style={styles.action}>
          <Text style={styles.actionText}>{content.action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offline: {
    backgroundColor: colors.text,
  },
  info: {
    backgroundColor: colors.primaryDark,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  message: {
    flex: 1,
    color: colors.surface,
    fontSize: fontSize.sm,
  },
  action: {
    minHeight: 32,
    justifyContent: "center",
  },
  actionText: {
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
