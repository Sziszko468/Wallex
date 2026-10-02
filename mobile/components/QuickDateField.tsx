import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { TextField } from "./TextField";
import { toIsoDate } from "../utils/date";
import { colors, fontSize, radius, spacing } from "../utils/theme";

interface QuickDateFieldProps {
  value: string;
  onChange: (isoDate: string) => void;
  error?: string;
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toIsoDate(date);
}

/** Defaults to today; "Today"/"Yesterday" cover the common case in one tap,
 * the text field below covers everything else without a native date-picker
 * dependency (see the explanation for why one wasn't added). */
export function QuickDateField({ value, onChange, error }: QuickDateFieldProps) {
  const { t } = useTranslation();
  const today = daysAgoIso(0);
  const yesterday = daysAgoIso(1);

  return (
    <View>
      <View style={styles.chipRow}>
        <QuickChip label={t("common.dates.today")} isActive={value === today} onPress={() => onChange(today)} />
        <QuickChip
          label={t("common.dates.yesterday")}
          isActive={value === yesterday}
          onPress={() => onChange(yesterday)}
        />
      </View>
      <TextField
        label={t("common.form.date")}
        placeholder={t("common.form.datePlaceholder")}
        value={value}
        onChangeText={onChange}
        error={error}
        autoCapitalize="none"
        maxLength={10}
      />
    </View>
  );
}

interface QuickChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function QuickChip({ label, isActive, onPress }: QuickChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, isActive && styles.chipActive, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textMuted,
  },
  chipTextActive: {
    color: "#fff",
  },
});
