import { Pressable, View, type PressableProps } from "react-native";
import { layout, makeStyles, radius, useTheme, type Palette } from "../../theme";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Text } from "./Text";

interface IconButtonProps extends Omit<PressableProps, "style" | "children"> {
  icon: IconName;
  /** What the button does. Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  /** plain: just the glyph · soft: on a tinted tile · outlined: a bordered tile · filled: a solid round button. */
  variant?: "plain" | "soft" | "outlined" | "filled";
  iconSize?: number;
  iconColor?: keyof Palette;
  /** A small count in the corner (active filters, unread notifications). */
  badge?: number;
}

const useStyles = makeStyles(({ colors }) => ({
  base: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  soft: { backgroundColor: colors.primarySoft },
  outlined: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filled: { backgroundColor: colors.primary, borderRadius: radius.full },
  filledPressed: { backgroundColor: colors.primaryPressed },
  pressed: { backgroundColor: colors.bgSubtle },
  softPressed: { backgroundColor: colors.primarySoftPressed },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
}));

/** A 44×44 icon button — the minimum comfortable touch target. */
export function IconButton({
  icon,
  variant = "plain",
  iconSize = 22,
  iconColor = "text",
  badge,
  disabled,
  ...rest
}: IconButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const glyphColor = variant === "soft" ? "primaryInk" : variant === "filled" ? "onPrimary" : iconColor;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityValue={badge ? { text: String(badge) } : undefined}
      disabled={disabled}
      android_ripple={{ color: colors.primarySoft, borderless: true, radius: 24 }}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        variant === "soft" && styles.soft,
        variant === "outlined" && styles.outlined,
        variant === "filled" && styles.filled,
        pressed && (variant === "soft" ? styles.softPressed : variant === "filled" ? styles.filledPressed : styles.pressed),
        disabled && { opacity: 0.45 },
      ]}
    >
      <Icon name={icon} size={iconSize} color={colors[glyphColor]} />
      {badge ? (
        <View style={styles.badge} importantForAccessibility="no-hide-descendants">
          <Text variant="small" color="onPrimary" style={{ fontSize: 11, lineHeight: 14 }}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
