import * as fs from "fs";
import * as path from "path";
import { darkPalette, lightPalette, type Palette } from "../../theme/tokens";
import { contrast, luminance } from "../helpers/colors";

// Accessibility guard for the design tokens: every pair of colours the UI actually puts together
// must meet WCAG 2.2 AA in BOTH themes. Change a colour in theme/tokens.ts and this test tells you
// immediately if it made something unreadable. (The web app has the same guard for its tokens.)

type ColorName = Exclude<keyof Palette, "overlay">;

interface Pair {
  foreground: ColorName;
  background: ColorName;
  minimum: number;
}

const TEXT_SURFACES: ColorName[] = ["bg", "surface", "surfaceSubtle", "surfaceRaised", "bgSubtle"];
const TONES = ["success", "danger", "warning", "info", "savings"] as const;

function requiredPairs(): Pair[] {
  const pairs: Pair[] = [];
  const add = (foreground: ColorName, background: ColorName, minimum: number) => pairs.push({ foreground, background, minimum });

  // Body and secondary text: 4.5:1 on every surface it can appear on.
  for (const text of ["text", "textSecondary", "textTertiary"] as const) {
    for (const surface of TEXT_SURFACES) add(text, surface, 4.5);
    add(text, "washSage", text === "textTertiary" ? 3 : 4.5);
  }
  for (const surface of ["bg", "surface", "surfaceRaised", "surfaceSubtle"] as const) add("primaryInk", surface, 4.5);
  add("primaryInk", "primarySoft", 4.5);
  add("primaryInk", "primarySoftPressed", 4.5);
  add("onPrimary", "primary", 4.5);
  add("onPrimary", "primaryPressed", 4.5);
  add("onDanger", "danger", 4.5);
  add("onDanger", "dangerPressed", 4.5);
  add("onPrimary", "success", 4.5);

  // Tone text (badges, amounts, notices) on the page, surfaces and its own soft background.
  for (const tone of TONES) {
    for (const surface of ["bg", "surface", "surfaceSubtle", "washSage"] as const) add(tone, surface, 4.5);
    add(tone, `${tone}Soft`, 4.5);
  }

  // Non-text: control borders, focus rings and chart series need 3:1 (WCAG 1.4.11).
  for (const surface of ["bg", "surface", "surfaceRaised"] as const) add("controlBorder", surface, 3);
  for (const surface of ["bg", "surface"] as const) {
    add("focus", surface, 3);
    add("primary", surface, 3);
    for (const series of ["chartIncome", "chartExpense", "chartSavings", "chartWarning", "chartNeutral"] as const) add(series, surface, 3);
  }
  return pairs;
}

describe.each([
  ["light", lightPalette],
  ["dark", darkPalette],
] as const)("design tokens — %s", (_name, palette) => {
  it("meets WCAG AA contrast for every pairing used in the UI", () => {
    const failures = requiredPairs()
      .map((pair) => ({ ...pair, ratio: contrast(palette[pair.foreground], palette[pair.background]) }))
      .filter((pair) => pair.ratio < pair.minimum)
      .map((pair) => `${pair.foreground} on ${pair.background}: ${pair.ratio.toFixed(2)} (needs ${pair.minimum})`);
    expect(failures).toEqual([]);
  });

  it("uses plain #rrggbb colours, which every platform draws the same", () => {
    const odd = Object.entries(palette)
      .filter(([name]) => name !== "overlay")
      .filter(([, value]) => !/^#[0-9a-f]{6}$/i.test(value))
      .map(([name]) => name);
    expect(odd).toEqual([]);
  });
});

describe("design tokens — the two themes", () => {
  it("define the same set of colours, so neither theme is missing something", () => {
    expect(Object.keys(darkPalette).sort()).toEqual(Object.keys(lightPalette).sort());
  });

  it("keep dark surfaces lighter as they rise: page < card < raised", () => {
    expect(luminance(darkPalette.bg)).toBeLessThan(luminance(darkPalette.surface));
    expect(luminance(darkPalette.surface)).toBeLessThan(luminance(darkPalette.surfaceRaised));
  });

  it("never use pure black or pure white as a page background", () => {
    for (const palette of [lightPalette, darkPalette]) {
      expect(palette.bg.toLowerCase()).not.toBe("#000000");
      expect(palette.bg.toLowerCase()).not.toBe("#ffffff");
      expect(palette.surface.toLowerCase()).not.toBe("#ffffff");
    }
  });

  it("shares its sage, teal and sand with the web app (same brand, same colours)", () => {
    // The web tokens are the source of truth; a copy that drifted would make the two apps look unrelated.
    const scss = fs.readFileSync(path.resolve(__dirname, "../../../web/src/styles/_tokens.scss"), "utf8").toLowerCase();
    for (const color of [lightPalette.primary, lightPalette.bg, lightPalette.surface, lightPalette.savings, lightPalette.sand, darkPalette.bg, darkPalette.primary, darkPalette.surface]) {
      expect(scss).toContain(color.toLowerCase());
    }
  });
});
