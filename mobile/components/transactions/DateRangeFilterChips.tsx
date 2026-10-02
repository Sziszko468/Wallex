import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FilterChip } from "./FilterChip";
import { spacing } from "../../utils/theme";

export type DatePreset = "all" | "thisMonth" | "lastMonth";

const PRESETS: readonly DatePreset[] = ["all", "thisMonth", "lastMonth"];

interface DateRangeFilterChipsProps {
  value: DatePreset;
  onChange: (preset: DatePreset) => void;
}

export function DateRangeFilterChips({ value, onChange }: DateRangeFilterChipsProps) {
  const { t } = useTranslation();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.row}>
        {PRESETS.map((preset) => (
          <FilterChip
            key={preset}
            label={t(`transactions.presets.${preset}`)}
            isActive={value === preset}
            onPress={() => onChange(preset)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
});
