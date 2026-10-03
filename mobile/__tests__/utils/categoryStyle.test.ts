import { palettes } from "../../theme/tokens";
import { categoryIconName, categoryLook } from "../../utils/categoryStyle";
import { hexToOklch, hexToRgb, mixOklch, oklchToHex, withAlpha } from "../../utils/oklch";
import { composite, contrast } from "../helpers/colors";

// The ten colours the backend gives the default categories, plus the extremes a custom one can have.
const DEFAULT_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444", "#6b7280", "#06b6d4", "#22c55e", "#a855f7"];
const EXTREMES = ["#000000", "#ffffff", "#ffff00", "#0000ff", "#9ca3af"];

function channelDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
}

describe("oklch", () => {
  it("reads #rgb and #rrggbb, and treats anything else as a neutral grey", () => {
    expect(hexToRgb("#3b82f6")).toEqual([59, 130, 246]);
    expect(hexToRgb("#38f")).toEqual([51, 136, 255]);
    expect(hexToRgb("not a colour")).toEqual([156, 163, 175]);
  });

  it.each([...DEFAULT_COLORS, ...EXTREMES])("converts %s to OKLCH and back without drifting", (hex) => {
    expect(channelDistance(oklchToHex(hexToOklch(hex)), hex)).toBeLessThanOrEqual(1);
  });

  it("mixing 100% of a colour gives that colour, 0% gives the other", () => {
    expect(channelDistance(mixOklch("#3b82f6", "#77736a", 1), "#3b82f6")).toBeLessThanOrEqual(1);
    expect(channelDistance(mixOklch("#3b82f6", "#77736a", 0), "#77736a")).toBeLessThanOrEqual(1);
  });

  it("a blend lands between its two colours in lightness", () => {
    const mixed = hexToOklch(mixOklch("#ffff00", "#000000", 0.5)).l;
    expect(mixed).toBeGreaterThan(hexToOklch("#000000").l);
    expect(mixed).toBeLessThan(hexToOklch("#ffff00").l);
  });

  it("writes a colour with transparency the way React Native wants it", () => {
    expect(withAlpha("#3b82f6", 0.16)).toBe("rgba(59, 130, 246, 0.16)");
  });
});

describe("categoryLook", () => {
  it("calms a saturated colour toward the theme's neutral: less chroma, still the same family of colour", () => {
    const original = hexToOklch("#3b82f6");
    const { tone } = categoryLook("#3b82f6", "light");
    const calmed = hexToOklch(tone);

    expect(calmed.c).toBeLessThan(original.c);
    // Blue stays in the blue-cyan range (the blend turns the hue a little, as CSS color-mix does on the web).
    expect(calmed.h).toBeGreaterThan(180);
    expect(calmed.h).toBeLessThan(290);
  });

  it("is one look per category and theme: the same object, every time", () => {
    expect(categoryLook("#10b981", "dark")).toBe(categoryLook("#10b981", "dark"));
    expect(categoryLook("#10b981", "dark").tone).not.toBe(categoryLook("#10b981", "light").tone);
  });

  it("falls back to a neutral grey when the category has no colour", () => {
    expect(categoryLook(undefined, "light").tone).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(["light", "dark"] as const)("keeps the glyph readable on its tile in the %s theme (3:1)", (scheme) => {
    const surface = palettes[scheme].surface;
    const failures = [...DEFAULT_COLORS, ...EXTREMES]
      .map((hex) => {
        const look = categoryLook(hex, scheme);
        return { hex, ratio: contrast(look.ink, composite(look.tint, surface)) };
      })
      .filter(({ ratio }) => ratio < 3)
      .map(({ hex, ratio }) => `${hex}: ${ratio.toFixed(2)}`);
    expect(failures).toEqual([]);
  });

  it("keeps the segment colour distinguishable from the card behind it (3:1 not required — it sits beside a label)", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (const hex of DEFAULT_COLORS) {
        expect(contrast(categoryLook(hex, scheme).tone, palettes[scheme].surface)).toBeGreaterThan(1.4);
      }
    }
  });
});

describe("categoryIconName", () => {
  it.each([
    ["Housing", "home"],
    ["Food", "utensils"],
    ["Transport", "car"],
    ["Salary", "briefcase"],
    ["  FOOD  ", "utensils"],
  ])("gives %j the %s glyph", (name, icon) => {
    expect(categoryIconName(name)).toBe(icon);
  });

  it.each([
    ["Lakhatás", "home"],
    ["Élelmiszer", "utensils"],
    ["Közlekedés", "car"],
    ["Fizetés", "briefcase"],
  ])("knows the Hungarian default name %s too", (name, icon) => {
    expect(categoryIconName(name)).toBe(icon);
  });

  it("has no glyph for a name it doesn't know (the tile shows the first letter instead)", () => {
    expect(categoryIconName("Pottery class")).toBeNull();
  });
});
