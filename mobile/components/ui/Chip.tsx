import { Pressable, View } from "react-native";
import { makeStyles, radius, space, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import { Text } from "./Text";

interface ChipProps {
  label: string;
  isSelected?: boolean;
  onPress: () => void;
  /** A small colour dot before the label (category chips). */
  dotColor?: string;
  /** Adds a remove (×) affordance — used for the active filters under a header. */
  onRemove?: () => void;
  accessibilityLabel?: string;
}

const useStyles = makeStyles(({ colors }) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minHeight: 40,
    paddingHorizontal: space[4],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pressed: { backgroundColor: colors.bgSubtle },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));

/** A selectable pill: one filter value, one quick choice. Selected = tinted and outlined, plus a check. */
export function Chip({ label, isSelected = false, onPress, dotColor, onRemove, accessibilityLabel }: ChipProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: isSelected }}
      onPress={onRemove ?? onPress}
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [styles.chip, isSelected && styles.selected, pressed && !isSelected && styles.pressed]}
    >
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      {isSelected && !onRemove ? <Icon name="check" size={15} color={colors.primaryInk} strokeWidth={2.25} /> : null}
      <Text variant="label" color={isSelected ? "primaryInk" : "textSecondary"} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? <Icon name="x" size={15} color={colors.primaryInk} strokeWidth={2.25} /> : null}
    </Pressable>
  );
}
