import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

interface FilterChipProps {
  label: string;
  isActive: boolean;
  /** Optional colored dot (used for category chips, omitted for plain filter chips). */
  color?: string;
  onPress: () => void;
}

export function FilterChip({ label, isActive, color, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, isActive && styles.chipActive, pressed && styles.pressed]}
    >
      {color && <View style={[styles.dot, { backgroundColor: isActive ? "#fff" : color }]} />}
      <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textMuted,
  },
  labelActive: {
    color: "#fff",
  },
});
