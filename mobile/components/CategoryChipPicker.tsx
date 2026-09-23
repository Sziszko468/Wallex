import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Category } from "../types/category";
import { colors, fontSize, radius, spacing } from "../utils/theme";

interface CategoryChipPickerProps {
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function CategoryChipPicker({ categories, selectedId, onSelect }: CategoryChipPickerProps) {
  if (categories.length === 0) {
    return <Text style={styles.empty}>No categories available for this type.</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.row}>
        {categories.map((category) => {
          const isSelected = category.id === selectedId;
          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={category.name}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(category.id)}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: category.color },
                isSelected && { backgroundColor: category.color },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[styles.dot, { backgroundColor: isSelected ? "#fff" : category.color }]}
              />
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
