import type { Category } from "../types/category";
import { categoryColorStyle, categoryIconName, FALLBACK_CATEGORY_COLOR } from "../utils/categoryStyle";
import { Icon } from "./icons/Icon";
import styles from "./CategoryMark.module.scss";

interface CategoryMarkProps {
  /** Only what's needed to draw the mark, so a chart row or a budget can use it without a full Category. */
  category: Pick<Category, "name" | "color"> | undefined;
  size?: "sm" | "md" | "lg";
}

/**
 * The category's tile: its glyph (or first letter) in a soft tint of its own colour.
 * Decorative — the category's name always sits next to it in text.
 */
export function CategoryMark({ category, size = "md" }: CategoryMarkProps) {
  const name = category?.name ?? "";
  const iconName = category ? categoryIconName(name) : null;
  return (
    <span
      className={`${styles.mark} ${styles[size]}`}
      style={categoryColorStyle(category?.color ?? FALLBACK_CATEGORY_COLOR)}
      aria-hidden="true"
    >
      {iconName ? <Icon name={iconName} size={size === "lg" ? 22 : size === "sm" ? 15 : 18} /> : (name.charAt(0).toUpperCase() || "·")}
    </span>
  );
}

interface CategoryDotProps {
  color: string | undefined;
}

/** A small round swatch for dense lists and legends. */
export function CategoryDot({ color }: CategoryDotProps) {
  return <span className={styles.dot} style={categoryColorStyle(color ?? FALLBACK_CATEGORY_COLOR)} aria-hidden="true" />;
}
