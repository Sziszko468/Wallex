import { Pressable, View } from "react-native";
import { layout, makeStyles, radius, space, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Text } from "./Text";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers ("Theme", "Language"). */
  accessibilityLabel?: string;
}

const useStyles = makeStyles(({ colors, shadows }) => ({
  track: {
    flexDirection: "row",
    padding: 3,
    gap: 2,
    borderRadius: radius.md + 3,
    backgroundColor: colors.bgSubtle,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    minHeight: layout.minTouch,
    paddingHorizontal: space[2],
    borderRadius: radius.md,
  },
  selected: { backgroundColor: colors.surfaceRaised, boxShadow: shadows.sm },
  pressed: { backgroundColor: colors.border },
}));

/**
 * Two to four exclusive choices side by side. The selected one is raised and darker, and — where a
 * glyph is given — the glyph carries the meaning too, so the choice never rests on colour alone.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: isSelected, selected: isSelected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.segment, isSelected && styles.selected, pressed && !isSelected && styles.pressed]}
          >
            {option.icon ? (
              <Icon name={option.icon} size={18} color={isSelected ? colors.primaryInk : colors.textSecondary} />
            ) : null}
            <Text variant="label" color={isSelected ? "text" : "textSecondary"} numberOfLines={1} style={{ flexShrink: 1 }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
