import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { RecurringFrequency } from "../../types/recurringTransaction";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

const FREQUENCIES: readonly RecurringFrequency[] = ["weekly", "monthly", "yearly"];

interface FrequencyPickerProps {
  value: RecurringFrequency;
  onChange: (frequency: RecurringFrequency) => void;
}

export function FrequencyPicker({ value, onChange }: FrequencyPickerProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {FREQUENCIES.map((frequency) => {
        const isActive = value === frequency;
        return (
          <Pressable
            key={frequency}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(frequency)}
            style={({ pressed }) => [
              styles.chip,
              isActive && styles.chipActive,
              pressed && !isActive && styles.pressed,
            ]}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{t(`recurring.frequency.${frequency}`)}</Text>
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
