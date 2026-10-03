// WALLEX design tokens for the phone app — the single source of truth for every colour, size,
// radius, shadow and duration. Screens and components never hard-code a value: they read them
// from useTheme() (colours, shadows) or import the constants below (spacing, radius, type).
//
// Same design language as the web app (web/src/styles/_tokens.scss, docs/design-system.md):
// "Sage & Linen" — warm off-whites instead of pure white, one muted sage accent, quiet semantic
// colours (muted coral for spending, teal for saving) and a deliberately designed dark theme
// (deep warm graphite, never black). The colour values below are the web's, byte for byte;
// theme/tokens.test.ts checks them for WCAG AA contrast in both themes.

export type ColorScheme = "light" | "dark";

export interface Palette {
  // Surfaces: page → card → raised (sheets, menus). Tonal steps rather than heavy borders.
  bg: string;
  bgSubtle: string; // sunken areas: progress tracks, segmented controls
  surface: string;
  surfaceSubtle: string; // nested panels
  surfaceRaised: string;
  overlay: string; // the scrim behind sheets

  border: string;
  borderStrong: string;
  controlBorder: string; // form controls: 3:1 against the surface (WCAG 1.4.11)
  divider: string;

  text: string;
  textSecondary: string;
  textTertiary: string;

  // Brand: muted sage
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  primarySoftPressed: string;
  primaryInk: string; // text and icons on the surface or on primarySoft
  onPrimary: string;

  // Money semantics — always paired with a sign, icon or label, never colour alone.
  success: string; // income
  successSoft: string;
  danger: string; // errors, over budget
  dangerSoft: string;
  dangerPressed: string;
  onDanger: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  savings: string;
  savingsSoft: string;

  focus: string;
  sand: string; // decorative only (the brand ring)

  // Charts and categories
  chartGrid: string;
  chartAxis: string;
  chartIncome: string; // bar fills: 3:1 against the surface (WCAG 1.4.11)
  chartExpense: string;
  chartSavings: string;
  chartWarning: string;
  chartNeutral: string;
  categoryMix: string; // category colours are blended toward this to calm saturated hexes

  // Loading placeholders
  skeletonBase: string;
  skeletonShine: string;

  // Decorative washes (balance card, auth screens). Tonal, low contrast, never behind small text.
  washSage: string;
  washSand: string;
}

export const lightPalette: Palette = {
  bg: "#f4f2ea",
  bgSubtle: "#ebe8dc",
  surface: "#fbfaf6",
  surfaceSubtle: "#f5f3ec",
  surfaceRaised: "#fffefb",
  overlay: "rgba(30, 37, 33, 0.46)",

  border: "#e2ded0",
  borderStrong: "#c9c4b3",
  controlBorder: "#7f8983",
  divider: "#e9e5d9",

  text: "#1e2521",
  textSecondary: "#4f5a54",
  textTertiary: "#5f6a64",

  primary: "#3a6a52",
  primaryPressed: "#264a38",
  primarySoft: "#e0eadf",
  primarySoftPressed: "#d2e0d1",
  primaryInk: "#2b5640",
  onPrimary: "#fbfaf6",

  success: "#2f7048",
  successSoft: "#dcebde",
  danger: "#a4453a",
  dangerSoft: "#f3dfda",
  dangerPressed: "#8f3a30",
  onDanger: "#fffaf8",
  warning: "#85590f",
  warningSoft: "#f2e6c8",
  info: "#3d638e",
  infoSoft: "#dde7f1",
  savings: "#2d6d7e",
  savingsSoft: "#daeaed",

  focus: "#2e5843",
  sand: "#c4a55a",

  chartGrid: "#e9e5d9",
  chartAxis: "#5f6a64",
  chartIncome: "#5a9474",
  chartExpense: "#cc6d5d",
  chartSavings: "#4a8fa0",
  chartWarning: "#b07a1e",
  chartNeutral: "#818a85",
  categoryMix: "#77736a",

  skeletonBase: "#ebe8dc",
  skeletonShine: "#f6f4ed",

  washSage: "#e3ecdf",
  washSand: "#f1ebd9",
};

export const darkPalette: Palette = {
  bg: "#111412",
  bgSubtle: "#0c0f0d",
  surface: "#181c19",
  surfaceSubtle: "#1d221f",
  surfaceRaised: "#232925",
  overlay: "rgba(3, 5, 4, 0.66)",

  border: "#2a302c",
  borderStrong: "#3a423d",
  controlBorder: "#6c766f",
  divider: "#242a26",

  text: "#ebe8de",
  textSecondary: "#b2b8af",
  textTertiary: "#8b9289",

  primary: "#86bb9b",
  primaryPressed: "#73ab89",
  primarySoft: "#20302a",
  primarySoftPressed: "#283a31",
  primaryInk: "#9bcaaf",
  onPrimary: "#0d1a13",

  success: "#7dbe98",
  successSoft: "#1d3226",
  danger: "#e58e7f",
  dangerSoft: "#3a2420",
  dangerPressed: "#f0a295",
  onDanger: "#2b100b",
  warning: "#ddb566",
  warningSoft: "#372f1b",
  info: "#8daed7",
  infoSoft: "#222e3d",
  savings: "#7cb8c8",
  savingsSoft: "#1d3238",

  focus: "#9bcaaf",
  sand: "#d8bd7b",

  chartGrid: "#242a26",
  chartAxis: "#8b9289",
  chartIncome: "#7dbe98",
  chartExpense: "#e58e7f",
  chartSavings: "#7cb8c8",
  chartWarning: "#ddb566",
  chartNeutral: "#6c766f",
  categoryMix: "#aaa598",

  skeletonBase: "#1d221f",
  skeletonShine: "#272e29",

  washSage: "#1c2a23",
  washSand: "#26241b",
};

export const palettes: Record<ColorScheme, Palette> = { light: lightPalette, dark: darkPalette };

/** Elevation as CSS-style box shadows (React Native 0.76+ draws them on both platforms). Very soft:
 *  most separation comes from tone and 1px borders instead. */
export interface Shadows {
  xs: string;
  sm: string;
  md: string;
  lg: string;
}

export const shadows: Record<ColorScheme, Shadows> = {
  light: {
    xs: "0px 1px 1px rgba(40, 50, 44, 0.04)",
    sm: "0px 1px 2px rgba(40, 50, 44, 0.06), 0px 0px 0px 1px rgba(40, 50, 44, 0.02)",
    md: "0px 8px 20px -8px rgba(40, 50, 44, 0.14), 0px 1px 3px rgba(40, 50, 44, 0.05)",
    lg: "0px 20px 50px -16px rgba(40, 50, 44, 0.28), 0px 3px 8px rgba(40, 50, 44, 0.06)",
  },
  dark: {
    xs: "0px 1px 1px rgba(0, 0, 0, 0.28)",
    sm: "0px 1px 2px rgba(0, 0, 0, 0.38)",
    md: "0px 10px 24px -10px rgba(0, 0, 0, 0.6)",
    lg: "0px 24px 56px -16px rgba(0, 0, 0, 0.7), 0px 0px 0px 1px rgba(255, 255, 255, 0.04)",
  },
};

// ---------------------------------------------------------------------------------------
// Tokens shared by both themes
// ---------------------------------------------------------------------------------------

/** A 4px scale — the same steps as the web app's --space-N. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Restrained: small things 6–8, controls 12, cards 16, major surfaces 22. */
export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
} as const;

/** Short and purposeful; all of it is switched off by the system's reduce-motion setting. */
export const motion = {
  fast: 120,
  base: 180,
  slow: 300,
} as const;

export const layout = {
  /** Every tap target is at least this tall and wide (WCAG 2.5.8, Apple HIG, Material). */
  minTouch: 44,
  controlHeight: 52,
  buttonHeight: 50,
  buttonHeightLarge: 56,
  tabBarHeight: 62,
  addButtonSize: 56,
  screenPadding: 20,
  /** Content never stretches across a tablet: it keeps a phone-like column in the middle. */
  contentMaxWidth: 640,
  bottomSheetMaxWidth: 560,
} as const;

// ---------------------------------------------------------------------------------------
// Typography — Plus Jakarta Sans, the same face as the web app. React Native can't synthesise
// weights for a custom font, so every weight is its own family name (see theme/fonts.ts).
// ---------------------------------------------------------------------------------------

export const fontFamilies = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

export type FontWeightName = keyof typeof fontFamilies;

export interface TextVariantStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: "uppercase";
  /** Figures line up in columns: amounts and balances use tabular numerals. */
  fontVariant?: "tabular-nums"[];
}

const tabular: "tabular-nums"[] = ["tabular-nums"];

export const textVariants = {
  /** The one big number on a screen (the balance). */
  display: { fontFamily: fontFamilies.bold, fontSize: 40, lineHeight: 46, letterSpacing: -0.9, fontVariant: tabular },
  /** A large amount that is the focus of a view (transaction details, amount entry). */
  amountHero: { fontFamily: fontFamilies.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.7, fontVariant: tabular },
  title: { fontFamily: fontFamilies.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  heading: { fontFamily: fontFamilies.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  subheading: { fontFamily: fontFamilies.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamilies.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fontFamilies.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: "uppercase" },
  amount: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 20, fontVariant: tabular },
  amountLarge: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, fontVariant: tabular },
  button: { fontFamily: fontFamilies.semibold, fontSize: 16, lineHeight: 20 },
  tab: { fontFamily: fontFamilies.semibold, fontSize: 11, lineHeight: 14 },
} as const satisfies Record<string, TextVariantStyle>;

export type TextVariant = keyof typeof textVariants;

/**
 * How far the system's text-size setting may enlarge each variant. Body text follows it generously
 * (it is what low-vision users enlarge on purpose); the big figures and the tab labels stop
 * earlier, or they would break their layouts.
 */
export const maxFontScale: Record<TextVariant, number> = {
  display: 1.15,
  amountHero: 1.2,
  title: 1.3,
  heading: 1.4,
  subheading: 1.5,
  body: 1.6,
  bodyStrong: 1.6,
  label: 1.5,
  caption: 1.5,
  small: 1.5,
  overline: 1.4,
  amount: 1.4,
  amountLarge: 1.3,
  button: 1.4,
  tab: 1.15,
};
