import { View } from "react-native";
import { makeStyles, radius, space, useTheme, type Palette } from "../../theme";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Text } from "./Text";

export type NoticeTone = "danger" | "warning" | "info" | "success";

interface NoticeProps {
  message: string | null;
  tone?: NoticeTone;
}

const TONES: Record<NoticeTone, { icon: IconName; background: keyof Palette; ink: keyof Palette }> = {
  danger: { icon: "alert-circle", background: "dangerSoft", ink: "danger" },
  warning: { icon: "alert-triangle", background: "warningSoft", ink: "warning" },
  info: { icon: "info", background: "infoSoft", ink: "info" },
  success: { icon: "check-circle", background: "successSoft", ink: "success" },
};

const useStyles = makeStyles(() => ({
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    padding: space[3],
    marginBottom: space[4],
    borderRadius: radius.md,
  },
}));

/** A message with an icon and a tint: what went wrong, what to know. Hidden when there is no message. */
export function Notice({ message, tone = "danger" }: NoticeProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!message) return null;
  const { icon, background, ink } = TONES[tone];

  return (
    <View
      accessible
      accessibilityRole={tone === "danger" || tone === "warning" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: colors[background] }]}
    >
      <View style={{ paddingTop: 1 }}>
        <Icon name={icon} size={18} color={colors[ink]} />
      </View>
      <Text variant="caption" color={ink} style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
        {message}
      </Text>
    </View>
  );
}
