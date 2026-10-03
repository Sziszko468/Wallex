import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, radius, space, useTheme } from "../theme";
import type { Category } from "../types/category";
import { CategoryMark } from "./ui/CategoryMark";
import { Text } from "./ui/Text";

interface CategoryPickerProps {
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

const COLUMNS = 4;
const TILE_PADDING = space[1];

const useStyles = makeStyles(({ colors }) => ({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -TILE_PADDING },
  cell: { width: `${100 / COLUMNS}%`, padding: TILE_PADDING },
  tile: {
    alignItems: "center",
    gap: space[2],
    minHeight: 92,
    paddingVertical: space[3],
    paddingHorizontal: 2,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: colors.surface,
  },
  name: { fontSize: 11, lineHeight: 14 },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { backgroundColor: colors.bgSubtle },
}));

/**
 * Categories as a grid of tiles — glyph above name — big enough for a thumb. The chosen one is
 * outlined and tinted (and announced as selected), so the choice never rests on colour alone.
 */
export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();

  if (categories.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        {t("common.form.noCategories")}
      </Text>
    );
  }

  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {categories.map((category) => {
        const isSelected = category.id === selectedId;
        return (
          <View key={category.id} style={styles.cell}>
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={category.name}
              accessibilityState={{ checked: isSelected, selected: isSelected }}
              onPress={() => onSelect(category.id)}
              android_ripple={{ color: colors.primarySoft }}
              style={({ pressed }) => [styles.tile, isSelected && styles.selected, pressed && !isSelected && styles.pressed]}
            >
              <CategoryMark category={category} />
              <Text
                variant="small"
                color={isSelected ? "primaryInk" : "textSecondary"}
                align="center"
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={styles.name}
              >
                {category.name}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
