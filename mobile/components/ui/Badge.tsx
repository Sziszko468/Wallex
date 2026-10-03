import { View } from "react-native";
import { makeStyles, radius, space, useTheme, type Palette } from "../../theme";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Text } from "./Text";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "savings";

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Status is never colour alone: pair the tone with a glyph or a clear label. */
  icon?: IconName;
}

const TONES: Record<BadgeTone, { background: keyof Palette; ink: keyof Palette }> = {
  neutral: { background: "bgSubtle", ink: "textSecondary" },
  primary: { background: "primarySoft", ink: "primaryInk" },
  success: { background: "successSoft", ink: "success" },
  warning: { background: "warningSoft", ink: "warning" },
  danger: { background: "dangerSoft", ink: "danger" },
  info: { background: "infoSoft", ink: "info" },
  savings: { background: "savingsSoft", ink: "savings" },
};

const useStyles = makeStyles(() => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space[1],
    minHeight: 24,
    paddingHorizontal: space[2],
    borderRadius: radius.sm,
  },
}));

/** A short status label: "On track", "Over budget", "Paused". */
export function Badge({ label, tone = "neutral", icon }: BadgeProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { background, ink } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors[background] }]}>
      {icon ? <Icon name={icon} size={13} color={colors[ink]} strokeWidth={2} /> : null}
      <Text variant="small" color={ink} numberOfLines={1} style={{ fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}
