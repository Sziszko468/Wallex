import type { IconName } from "../components/icons/iconPaths";
import { palettes, type ColorScheme } from "../theme/tokens";
import { hexToOklch, mixOklch, oklchToHex, withAlpha } from "./oklch";

/** Used when a category can't be found (deleted on another device, still loading). */
export const FALLBACK_CATEGORY_COLOR = "#9ca3af";

/** How much of the category's own colour survives the blend toward the theme's neutral. */
const TONE_STRENGTH = 0.76;
/** The tinted tile behind a category glyph: a light wash of its own colour. */
const TINT_ALPHA: Record<ColorScheme, number> = { light: 0.16, dark: 0.24 };
/** The glyph on that tile must stay readable: dark enough on light, light enough on dark. */
const INK_MAX_LIGHTNESS = 0.46;
const INK_MIN_LIGHTNESS = 0.78;

export interface CategoryLook {
  /** The calmed category colour: bars, dots, chart segments. */
  tone: string;
  /** The soft background of the category's tile. */
  tint: string;
  /** The colour of the glyph or letter on that tile. */
  ink: string;
}

const looks = new Map<string, CategoryLook>();

/**
 * One category, one look — in lists, charts, budgets and badges. The category's own colour is the
 * only input; its presentation is derived from it, so the same category is never two different
 * colours in two places. Saturated picks are blended toward a theme-aware neutral, which calms
 * them in light mode and keeps them readable in dark mode (the same recipe as the web app).
 */
export function categoryLook(hex: string | undefined, scheme: ColorScheme): CategoryLook {
  const color = hex || FALLBACK_CATEGORY_COLOR;
  const key = `${scheme}:${color}`;
  const cached = looks.get(key);
  if (cached) return cached;

  const tone = mixOklch(color, palettes[scheme].categoryMix, TONE_STRENGTH);
  const { l, c, h } = hexToOklch(tone);
  const ink = oklchToHex({
    l: scheme === "light" ? Math.min(l, INK_MAX_LIGHTNESS) : Math.max(l, INK_MIN_LIGHTNESS),
    c,
    h,
  });
  const look: CategoryLook = { tone, tint: withAlpha(tone, TINT_ALPHA[scheme]), ink };
  looks.set(key, look);
  return look;
}

// Hand-picked glyphs for the default categories and their usual synonyms, in English and in
// Hungarian (the API sends the default names in the account's language). Anything else falls back
// to the category's first letter, so custom categories still get a recognisable mark.
const ICON_KEYWORDS: [IconName, string[]][] = [
  ["home", ["housing", "home", "rent", "mortgage", "household", "lakhatás", "lakás", "albérlet"]],
  ["shopping-cart", ["groceries", "grocery", "supermarket", "bevásárlás"]],
  ["utensils", ["food", "dining", "restaurant", "restaurants", "eating out", "takeaway", "élelmiszer", "étterem"]],
  ["coffee", ["coffee", "cafe", "café", "kávé"]],
  ["car", ["transport", "transportation", "car", "fuel", "gas", "taxi", "transit", "commute", "parking", "közlekedés", "autó"]],
  ["shopping-bag", ["shopping", "clothes", "clothing", "fashion", "vásárlás", "ruházat"]],
  ["film", ["entertainment", "movies", "cinema", "games", "music", "hobbies", "leisure", "szórakozás", "hobbi"]],
  ["heart-pulse", ["health", "medical", "pharmacy", "healthcare", "doctor", "egészség", "gyógyszertár"]],
  ["dumbbell", ["fitness", "gym", "sport", "sports", "edzés", "sportolás"]],
  ["zap", ["utilities", "energy", "electricity", "rezsi", "áram"]],
  ["receipt", ["bills", "bill", "insurance", "phone", "internet", "fees", "taxes", "számlák", "biztosítás", "adó"]],
  ["plane", ["travel", "holiday", "vacation", "flights", "hotel", "trip", "utazás", "nyaralás"]],
  ["gift", ["gifts", "gift", "donations", "charity", "ajándék", "adomány"]],
  ["book", ["education", "books", "school", "courses", "oktatás", "könyvek", "tanulás"]],
  ["briefcase", ["salary", "wages", "wage", "paycheck", "work", "freelance", "business", "fizetés", "bér", "munka"]],
  ["banknote", ["income", "bonus", "interest", "refund", "investments", "dividends", "bevétel", "jutalom", "kamat"]],
];

/** The glyph for a category name, or null when it has no hand-picked one. */
export function categoryIconName(name: string): IconName | null {
  const normalized = name.trim().toLowerCase();
  const match = ICON_KEYWORDS.find(([, words]) => words.includes(normalized));
  return match ? match[0] : null;
}
