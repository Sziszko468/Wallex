import { ScrollView, StyleSheet, View } from "react-native";
import { FilterChip } from "./FilterChip";
import { spacing } from "../../utils/theme";

export type DatePreset = "all" | "thisMonth" | "lastMonth";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
];

interface DateRangeFilterChipsProps {
  value: DatePreset;
  onChange: (preset: DatePreset) => void;
}

export function DateRangeFilterChips({ value, onChange }: DateRangeFilterChipsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.row}>
        {PRESETS.map((preset) => (
          <FilterChip
            key={preset.value}
            label={preset.label}
            isActive={value === preset.value}
            onPress={() => onChange(preset.value)}
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
