import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TransactionType } from "../types/category";
import { colors, fontSize, radius, spacing } from "../utils/theme";

interface TypeToggleProps {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
}

export function TypeToggle({ value, onChange }: TypeToggleProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Segment
        label={t("common.transactionType.expense")}
        isActive={value === "expense"}
        activeColor={colors.danger}
        onPress={() => onChange("expense")}
      />
      <Segment
        label={t("common.transactionType.income")}
        isActive={value === "income"}
        activeColor={colors.success}
        onPress={() => onChange("income")}
      />
    </View>
  );
}

interface SegmentProps {
  label: string;
  isActive: boolean;
  activeColor: string;
  onPress: () => void;
}

function Segment({ label, isActive, activeColor, onPress }: SegmentProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        isActive && { backgroundColor: activeColor, borderColor: activeColor },
        pressed && !isActive && styles.pressed,
      ]}
    >
      <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.textMuted,
  },
  labelActive: {
    color: "#fff",
  },
});
