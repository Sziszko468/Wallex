/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from the web/ folder.
const source = readFileSync(resolve(process.cwd(), "src/styles/_tokens.scss"), "utf8");

// Accessibility guard for the design tokens: every pair of colours the UI actually puts
// together must meet WCAG 2.2 AA in BOTH themes. Change a token in _tokens.scss and this
// test tells you immediately if it made something unreadable.

/** The `--name: #hex;` declarations inside `@mixin <name> { … }`. */
function readTheme(mixin: "light-tokens" | "dark-tokens"): Record<string, string> {
  const start = source.indexOf(`@mixin ${mixin} {`);
  let depth = 0;
  let index = source.indexOf("{", start);
  const from = index;
  for (; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const tokens: Record<string, string> = {};
  for (const match of source.slice(from, index).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[match[1] as string] = match[2] as string;
  }
  return tokens;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const TEXT_ON_SURFACES = ["bg", "surface", "surface-subtle", "surface-raised", "bg-subtle"];
const TONES = ["success", "danger", "warning", "info", "savings"];

interface Pair {
  foreground: string;
  background: string;
  minimum: number;
}

function requiredPairs(): Pair[] {
  const pairs: Pair[] = [];
  const add = (foreground: string, background: string, minimum: number) => pairs.push({ foreground, background, minimum });

  // Body and secondary text: 4.5:1 on every surface they can appear on.
  for (const text of ["color-text", "color-text-secondary", "color-text-tertiary"]) {
    for (const surface of TEXT_ON_SURFACES) add(text, `color-${surface}`, 4.5);
  }
  for (const surface of ["bg", "surface", "surface-raised", "surface-subtle"]) add("color-primary-ink", `color-${surface}`, 4.5);
  add("color-primary-ink", "color-primary-soft", 4.5);
  for (const fill of ["primary", "primary-hover", "primary-pressed"]) add("color-on-primary", `color-${fill}`, 4.5);
  for (const fill of ["danger", "danger-hover"]) add("color-on-danger", `color-${fill}`, 4.5);

  // Tone text (badges, amounts, notices) on the page, surfaces and its own soft background.
  for (const tone of TONES) {
    for (const surface of ["bg", "surface", "surface-subtle"]) add(`color-${tone}`, `color-${surface}`, 4.5);
    add(`color-${tone}`, `color-${tone}-soft`, 4.5);
  }

  // Non-text: control borders, focus rings and chart series need 3:1 (WCAG 1.4.11).
  for (const surface of ["bg", "surface", "surface-raised"]) add("color-control-border", `color-${surface}`, 3);
  for (const surface of ["bg", "surface"]) {
    add("color-focus", `color-${surface}`, 3);
    add("color-primary", `color-${surface}`, 3);
    for (const series of ["chart-income", "chart-expense", "chart-savings", "chart-warning", "chart-neutral"]) add(series, `color-${surface}`, 3);
  }
  return pairs;
}

describe.each(["light-tokens", "dark-tokens"] as const)("design tokens — %s", (mixin) => {
  const tokens = readTheme(mixin);

  it("defines every colour the contrast rules refer to", () => {
    const missing = requiredPairs()
      .flatMap((pair) => [pair.foreground, pair.background])
      .filter((name) => tokens[name] === undefined);
    expect([...new Set(missing)]).toEqual([]);
  });

  it("meets WCAG AA contrast for every pairing used in the UI", () => {
    const failures = requiredPairs()
      .map((pair) => ({ ...pair, ratio: contrast(tokens[pair.foreground] as string, tokens[pair.background] as string) }))
      .filter((pair) => pair.ratio < pair.minimum)
      .map((pair) => `${pair.foreground} on ${pair.background}: ${pair.ratio.toFixed(2)} (needs ${pair.minimum})`);
    expect(failures).toEqual([]);
  });
});

describe("design tokens — the two themes", () => {
  it("define the same set of colours, so neither theme is missing something", () => {
    expect(Object.keys(readTheme("dark-tokens")).sort()).toEqual(Object.keys(readTheme("light-tokens")).sort());
  });

  it("keep dark surfaces lighter as they rise: page < card < raised", () => {
    const dark = readTheme("dark-tokens");
    expect(luminance(dark["color-bg"] as string)).toBeLessThan(luminance(dark["color-surface"] as string));
    expect(luminance(dark["color-surface"] as string)).toBeLessThan(luminance(dark["color-surface-raised"] as string));
  });

  it("never use pure black or pure white as a page background", () => {
    for (const theme of [readTheme("light-tokens"), readTheme("dark-tokens")]) {
      expect(theme["color-bg"]?.toLowerCase()).not.toBe("#000000");
      expect(theme["color-bg"]?.toLowerCase()).not.toBe("#ffffff");
      expect(theme["color-surface"]?.toLowerCase()).not.toBe("#ffffff");
    }
  });
});
