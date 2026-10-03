import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOffline } from "../hooks/useOffline";
import { layout, makeStyles, space, useTheme, type Palette } from "../theme";
import { formatDateTime } from "../utils/format";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconPaths";
import { Text } from "./ui/Text";

interface BannerContent {
  tone: "offline" | "info" | "danger";
  message: string;
  action?: { label: string; onPress: () => void };
}

const TONES: Record<BannerContent["tone"], { icon: IconName; background: keyof Palette; ink: keyof Palette }> = {
  offline: { icon: "alert-triangle", background: "warningSoft", ink: "warning" },
  info: { icon: "refresh", background: "infoSoft", ink: "info" },
  danger: { icon: "alert-circle", background: "dangerSoft", ink: "danger" },
};

const useStyles = makeStyles(() => ({
  banner: { flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: layout.screenPadding, paddingVertical: space[2], minHeight: layout.minTouch },
  action: { minHeight: layout.minTouch, justifyContent: "center" },
}));

/** Top-of-app status line: offline state, cached data age, and sync progress/problems. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
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

  const { icon, background, ink } = TONES[content.tone];

  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: colors[background] }]}>
      <Icon name={icon} size={18} color={colors[ink]} />
      <Text variant="caption" color={ink} style={{ flex: 1, fontSize: 13 }}>
        {content.message}
      </Text>
      {content.action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={content.action.label} onPress={content.action.onPress} style={styles.action}>
          <Text variant="label" color={ink} style={{ textDecorationLine: "underline" }}>
            {content.action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
