import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CurrencyCode } from "../types/currency";
import { CURRENCY_CODES } from "../utils/currency";
import { colors, fontSize, radius, spacing } from "../utils/theme";

interface CurrencyChipPickerProps {
  selected: CurrencyCode;
  onSelect: (currency: CurrencyCode) => void;
}

/** One chip per supported currency — six options fit a horizontal row better than a dropdown. */
export function CurrencyChipPicker({ selected, onSelect }: CurrencyChipPickerProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.row}>
        {CURRENCY_CODES.map((code) => {
          const isSelected = code === selected;
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityLabel={code}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(code)}
              style={({ pressed }) => [styles.chip, isSelected && styles.chipSelected, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{code}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
  },
  chipTextSelected: {
    color: "#fff",
  },
});
