import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatMonthYear } from "../utils/format";
import { colors, fontSize, radius, spacing } from "../utils/theme";

interface MonthSelectorProps {
  year: number;
  month: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function MonthSelector({ year, month, onPrevious, onNext }: MonthSelectorProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        onPress={onPrevious}
        hitSlop={8}
        style={({ pressed }) => [styles.chevron, pressed && styles.chevronPressed]}
      >
        <Text style={styles.chevronText}>‹</Text>
      </Pressable>

      <Text style={styles.label}>{formatMonthYear(year, month)}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        onPress={onNext}
        hitSlop={8}
        style={({ pressed }) => [styles.chevron, pressed && styles.chevronPressed]}
      >
        <Text style={styles.chevronText}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  chevron: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chevronPressed: {
    opacity: 0.6,
  },
  chevronText: {
    fontSize: fontSize.xl,
    color: colors.primary,
    fontWeight: "700",
  },
  label: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
  },
});
