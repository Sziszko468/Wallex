import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useOffline } from "../hooks/useOffline";
import { colors, fontSize, spacing } from "../utils/theme";

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface BannerContent {
  tone: "offline" | "info" | "danger";
  message: string;
  action?: { label: string; onPress: () => void };
}

/** Top-of-app status line: offline state, cached data age, and sync progress/problems. */
export function OfflineBanner() {
  const { isOffline, cacheServedAt, pendingCount, failedCount, isSyncing, syncNow } = useOffline();
  const content = getContent();
  if (!content) return null;

  function getContent(): BannerContent | null {
    if (isOffline) {
      const saved = cacheServedAt ? `Showing data saved ${formatTime(cacheServedAt)}.` : "Showing saved data.";
      const waiting = pendingCount > 0 ? ` ${pluralize(pendingCount, "transaction")} will sync when you're back online.` : "";
      return { tone: "offline", message: `You're offline. ${saved}${waiting}` };
    }
    if (failedCount > 0) {
      return {
        tone: "danger",
        message: `${pluralize(failedCount, "transaction")} couldn't be synced.`,
        action: { label: "Review", onPress: () => router.push("/transactions") },
      };
    }
    if (isSyncing && pendingCount > 0) {
      return { tone: "info", message: `Syncing ${pluralize(pendingCount, "transaction")}…` };
    }
    if (pendingCount > 0) {
      return {
        tone: "info",
        message: `${pluralize(pendingCount, "transaction")} waiting to sync.`,
        action: { label: "Sync now", onPress: () => void syncNow() },
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
