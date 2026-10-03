import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { makeStyles, radius, space, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Text } from "./Text";

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** A glyph on a soft tile before the title. */
  icon?: IconName;
  /** Read-only value at the end ("EUR", "English"). */
  value?: string;
  /** Anything else at the end — a Switch, a Badge. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** danger: a destructive row (log out, delete). */
  tone?: "default" | "danger";
  accessibilityLabel?: string;
}

const useStyles = makeStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: 60,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  pressed: { backgroundColor: colors.surfaceSubtle },
  tile: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md - 2,
    backgroundColor: colors.bgSubtle,
  },
  dangerTile: { backgroundColor: colors.dangerSoft },
  text: { flex: 1, gap: 2 },
}));

/**
 * One row of a grouped list (settings, "more"). With `onPress` it is a button with a chevron;
 * without, it just shows its value or control.
 */
export function ListRow({ title, subtitle, icon, value, trailing, onPress, tone = "default", accessibilityLabel }: ListRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isDanger = tone === "danger";

  const content = (
    <>
      {icon ? (
        <View style={[styles.tile, isDanger && styles.dangerTile]} importantForAccessibility="no-hide-descendants">
          <Icon name={icon} size={20} color={isDanger ? colors.danger : colors.textSecondary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" color={isDanger ? "danger" : "text"}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="body" color="textSecondary">
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress ? <Icon name="chevron-right" size={18} color={colors.textTertiary} /> : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, value].filter(Boolean).join(", ")}
      onPress={onPress}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const useGroupStyles = makeStyles(({ colors }) => ({
  group: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  divider: { height: 1, marginLeft: space[4] + 36 + space[3], backgroundColor: colors.divider },
  dividerNoIcon: { marginLeft: space[4] },
}));

/** A bordered group of rows with hairline dividers between them. */
export function ListGroup({ children, hasIcons = true }: { children: ReactNode[] | ReactNode; hasIcons?: boolean }) {
  const styles = useGroupStyles();
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={styles.group}>
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 ? <View style={[styles.divider, !hasIcons && styles.dividerNoIcon]} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}
