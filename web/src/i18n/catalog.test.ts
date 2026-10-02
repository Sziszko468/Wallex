import { describe, expect, it } from "vitest";
import { en } from "./locales/en";
import { hu } from "./locales/hu";

type Tree = { [key: string]: string | Tree };

/** { a: { b: "x" } } → { "a.b": "x" } */
function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") flat[path] = value;
    else Object.assign(flat, flatten(value, path));
  }
  return flat;
}

const english = flatten(en as unknown as Tree);
const hungarian = flatten(hu as unknown as Tree);

/** "{{count}}" placeholders, sorted: the values a translation must keep. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1] ?? "").sort();
}

/** "<strong>" / "<code>" markers of <Trans> texts, sorted. */
function markers(text: string): string[] {
  return [...text.matchAll(/<\/?(\w+)>/g)].map((match) => match[0]).sort();
}

describe("translation catalogs", () => {
  it("has the same keys in English and Hungarian", () => {
    expect(Object.keys(hungarian).sort()).toEqual(Object.keys(english).sort());
  });

  it("has no empty text", () => {
    const empty = [...Object.entries(english), ...Object.entries(hungarian)].filter(([, text]) => text.trim() === "");
    expect(empty).toEqual([]);
  });

  it("keeps every {{placeholder}} of the English text in the Hungarian one", () => {
    const mismatched = Object.keys(english).filter(
      (key) => JSON.stringify(placeholders(english[key] ?? "")) !== JSON.stringify(placeholders(hungarian[key] ?? ""))
    );
    expect(mismatched).toEqual([]);
  });

  it("keeps every <tag> marker of the English text in the Hungarian one", () => {
    const mismatched = Object.keys(english).filter(
      (key) => JSON.stringify(markers(english[key] ?? "")) !== JSON.stringify(markers(hungarian[key] ?? ""))
    );
    expect(mismatched).toEqual([]);
  });

  it("gives every plural form (_one and _other) in both languages", () => {
    for (const catalog of [english, hungarian]) {
      for (const key of Object.keys(catalog)) {
        if (key.endsWith("_one")) expect(catalog[key.replace(/_one$/, "_other")]).toBeDefined();
        if (key.endsWith("_other")) expect(catalog[key.replace(/_other$/, "_one")]).toBeDefined();
      }
    }
  });

  it("does not leave English text in the Hungarian catalog", () => {
    // Words that are the same in both languages (brand, units, codes) are fine; whole phrases are not.
    const untranslated = Object.keys(english).filter((key) => {
      const text = english[key] ?? "";
      const words = text.replace(/\{\{\s*\w+\s*\}\}/g, "").replace(/[^A-Za-z]/g, "");
      return words.length > 8 && text === hungarian[key];
    });
    expect(untranslated).toEqual([]);
  });

  it("uses every key somewhere in the source", () => {
    const sources = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.*", "!./locales/**", "!../test/**"], {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const code = Object.values(sources).join("\n");

    const literals = new Set([...code.matchAll(/["'`]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)["'`]/g)].map((m) => m[1] ?? ""));
    // t(`budgets.status.${status}`) uses every key under "budgets.status.".
    const dynamicPrefixes = [...code.matchAll(/`([a-z][A-Za-z0-9.]*\.)\$\{/g)].map((m) => m[1] ?? "");

    const unused = Object.keys(english).filter((key) => {
      const base = key.replace(/_(one|other)$/, "");
      return !literals.has(base) && !dynamicPrefixes.some((prefix) => base.startsWith(prefix));
    });
    expect(unused).toEqual([]);
  });
});
