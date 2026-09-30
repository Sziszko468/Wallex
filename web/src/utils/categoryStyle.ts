import type { CSSProperties } from "react";
import type { IconName } from "../components/icons/iconPaths";

/** Used when a category can't be found (deleted on another device, still loading). */
export const FALLBACK_CATEGORY_COLOR = "#9ca3af";

/**
 * One category, one look — in lists, charts, budgets and badges. The category's own colour is the
 * only input; its presentation is derived from it, so the same category is never two different
 * colours in two places. Saturated picks are blended toward a theme-aware neutral
 * (--category-mix), which calms them in light mode and keeps them readable in dark mode.
 * The result is a CSS colour string: use it for chart fills and inline backgrounds.
 */
export function categoryTone(hex: string): string {
  return `color-mix(in oklch, ${hex} 76%, var(--category-mix))`;
}

/** The custom property every category-coloured element reads (see CategoryMark / CategoryDot). */
export function categoryColorStyle(hex: string): CSSProperties {
  return { "--cat": hex } as CSSProperties;
}

// Hand-picked glyphs for the default categories and their usual synonyms. Anything else falls
// back to the category's first letter, so custom categories still get a recognisable mark.
const ICON_KEYWORDS: [IconName, string[]][] = [
  ["home", ["housing", "home", "rent", "mortgage", "household"]],
  ["shopping-cart", ["groceries", "grocery", "supermarket"]],
  ["utensils", ["food", "dining", "restaurant", "restaurants", "eating out", "takeaway"]],
  ["coffee", ["coffee", "cafe", "café"]],
  ["car", ["transport", "transportation", "car", "fuel", "gas", "taxi", "transit", "commute", "parking"]],
  ["shopping-bag", ["shopping", "clothes", "clothing", "fashion"]],
  ["film", ["entertainment", "movies", "cinema", "games", "music", "hobbies", "leisure"]],
  ["heart-pulse", ["health", "medical", "pharmacy", "healthcare", "doctor"]],
  ["dumbbell", ["fitness", "gym", "sport", "sports"]],
  ["zap", ["utilities", "energy", "electricity"]],
  ["receipt", ["bills", "bill", "insurance", "phone", "internet", "fees", "taxes"]],
  ["plane", ["travel", "holiday", "vacation", "flights", "hotel", "trip"]],
  ["gift", ["gifts", "gift", "donations", "charity"]],
  ["book", ["education", "books", "school", "courses"]],
  ["briefcase", ["salary", "wages", "wage", "paycheck", "work", "freelance", "business"]],
  ["banknote", ["income", "bonus", "interest", "refund", "investments", "dividends"]],
];

/** The glyph for a category name, or null when it has no hand-picked one. */
export function categoryIconName(name: string): IconName | null {
  const normalized = name.trim().toLowerCase();
  const match = ICON_KEYWORDS.find(([, words]) => words.includes(normalized));
  return match ? match[0] : null;
}
