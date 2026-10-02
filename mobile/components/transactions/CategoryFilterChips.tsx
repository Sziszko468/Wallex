import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Category } from "../../types/category";
import { FilterChip } from "./FilterChip";
import { spacing } from "../../utils/theme";

interface CategoryFilterChipsProps {
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

export function CategoryFilterChips({ categories, selectedId, onSelect }: CategoryFilterChipsProps) {
  const { t } = useTranslation();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.row}>
        <FilterChip label={t("transactions.allCategories")} isActive={selectedId === null} onPress={() => onSelect(null)} />
        {categories.map((category) => (
          <FilterChip
            key={category.id}
            label={category.name}
            color={category.color}
            isActive={selectedId === category.id}
            onPress={() => onSelect(category.id)}
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
