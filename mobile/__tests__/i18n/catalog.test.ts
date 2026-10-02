import * as fs from "fs";
import * as path from "path";
import { en } from "../../i18n/locales/en";
import { hu } from "../../i18n/locales/hu";

type Tree = { [key: string]: string | Tree };

/** { a: { b: "x" } } → { "a.b": "x" } */
function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") flat[keyPath] = value;
    else Object.assign(flat, flatten(value, keyPath));
  }
  return flat;
}

const english = flatten(en as unknown as Tree);
const hungarian = flatten(hu as unknown as Tree);

/** "{{count}}" placeholders, sorted: the values a translation must keep. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1] ?? "").sort();
}

const ROOT = path.resolve(__dirname, "../..");
const SOURCE_DIRS = ["app", "components", "screens", "hooks", "services", "utils", "i18n"];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "locales" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
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

  it("gives every plural form (_one and _other) in both languages", () => {
    for (const catalog of [english, hungarian]) {
      for (const key of Object.keys(catalog)) {
        if (key.endsWith("_one")) expect(catalog[key.replace(/_one$/, "_other")]).toBeDefined();
        if (key.endsWith("_other")) expect(catalog[key.replace(/_other$/, "_one")]).toBeDefined();
      }
    }
  });

  it("does not leave English text in the Hungarian catalog", () => {
    const untranslated = Object.keys(english).filter((key) => {
      const text = english[key] ?? "";
      const words = text.replace(/\{\{\s*\w+\s*\}\}/g, "").replace(/[^A-Za-z]/g, "");
      return words.length > 8 && text === hungarian[key];
    });
    expect(untranslated).toEqual([]);
  });

  it("uses every key somewhere in the source", () => {
    const code = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    const literals = new Set([...code.matchAll(/["'`]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)["'`]/g)].map((m) => m[1] ?? ""));
    // t(`recurring.frequency.${frequency}`) uses every key under "recurring.frequency.".
    const dynamicPrefixes = [...code.matchAll(/`([a-z][A-Za-z0-9.]*\.)\$\{/g)].map((m) => m[1] ?? "");

    const unused = Object.keys(english).filter((key) => {
      const base = key.replace(/_(one|other)$/, "");
      return !literals.has(base) && !dynamicPrefixes.some((prefix) => base.startsWith(prefix));
    });
    expect(unused).toEqual([]);
  });
});
