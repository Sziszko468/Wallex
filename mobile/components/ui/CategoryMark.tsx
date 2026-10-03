import { View } from "react-native";
import { fontFamilies, useTheme } from "../../theme";
import type { Category } from "../../types/category";
import { categoryIconName, categoryLook } from "../../utils/categoryStyle";
import { Icon } from "../icons/Icon";
import { Text } from "./Text";

const SIZES = { sm: 32, md: 40, lg: 52 } as const;
const GLYPH_SIZES = { sm: 16, md: 20, lg: 26 } as const;
const CORNER_RATIO = 0.32;

interface CategoryMarkProps {
  /** Only what's needed to draw the mark, so a chart row or a budget can use it without a full Category. */
  category: Pick<Category, "name" | "color"> | undefined;
  size?: keyof typeof SIZES;
}

/**
 * The category's tile: its glyph (or first letter) in a soft tint of its own colour — the same
 * recipe as on the web. Decorative: the category's name always sits next to it in text.
 */
export function CategoryMark({ category, size = "md" }: CategoryMarkProps) {
  const { scheme } = useTheme();
  const look = categoryLook(category?.color, scheme);
  const dimension = SIZES[size];
  const name = category?.name ?? "";
  const glyph = category ? categoryIconName(name) : null;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: dimension,
        height: dimension,
        borderRadius: dimension * CORNER_RATIO,
        backgroundColor: look.tint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {glyph ? (
        <Icon name={glyph} size={GLYPH_SIZES[size]} color={look.ink} />
      ) : (
        <Text style={{ color: look.ink, fontFamily: fontFamilies.semibold, fontSize: GLYPH_SIZES[size] - 2, lineHeight: GLYPH_SIZES[size] + 2 }}>
          {name.charAt(0).toUpperCase() || "·"}
        </Text>
      )}
    </View>
  );
}

interface CategoryDotProps {
  color: string | undefined;
  size?: number;
}

/** A small round swatch for dense lists and legends. */
export function CategoryDot({ color, size = 10 }: CategoryDotProps) {
  const { scheme } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: categoryLook(color, scheme).tone }}
    />
  );
}
