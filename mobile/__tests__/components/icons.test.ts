import * as fs from "fs";
import * as path from "path";
import { ICON_NAMES, ICON_PATHS } from "../../components/icons/iconPaths";

/** The names in the web app's icon set (web/src/components/icons/iconPaths.tsx). */
function webIconNames(): string[] {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../web/src/components/icons/iconPaths.tsx"), "utf8");
  const list = /export const ICON_NAMES = \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? "";
  return [...list.matchAll(/"([a-z-]+)"/g)].map((match) => match[1] as string);
}

describe("icon set", () => {
  it("has geometry for every name, and no name twice", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    for (const name of ICON_NAMES) expect(ICON_PATHS[name]).toBeTruthy();
    expect(Object.keys(ICON_PATHS).sort()).toEqual([...ICON_NAMES].sort());
  });

  it("includes every icon of the web app, so both apps speak one icon language", () => {
    const web = webIconNames();
    expect(web.length).toBeGreaterThan(50);
    expect(web.filter((name) => !(ICON_NAMES as readonly string[]).includes(name))).toEqual([]);
  });
});
