import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RecurringFrequency } from "../../types/recurringTransaction";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

interface FrequencyPickerProps {
  value: RecurringFrequency;
  onChange: (frequency: RecurringFrequency) => void;
}

export function FrequencyPicker({ value, onChange }: FrequencyPickerProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {FREQUENCIES.map((frequency) => {
        const isActive = value === frequency.value;
        return (
          <Pressable
            key={frequency.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(frequency.value)}
            style={({ pressed }) => [
              styles.chip,
              isActive && styles.chipActive,
              pressed && !isActive && styles.pressed,
            ]}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{frequency.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
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
  label: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.textMuted,
  },
  labelActive: {
    color: "#fff",
  },
});
