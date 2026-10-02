import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";
import staticConfig from "../../app.json";
import appConfig, { resolveVariant } from "../../app.config";

const ROOT = path.resolve(__dirname, "../..");
const PRODUCTION_URL = "https://wallex.example.com/api";
const MANAGED_ENV = ["APP_VARIANT", "EXPO_PUBLIC_API_BASE_URL", "GOOGLE_SERVICES_JSON"] as const;

/** Resolves app.config.ts exactly like Expo CLI does, with the given build environment. */
function resolveConfig(env: Partial<Record<(typeof MANAGED_ENV)[number], string>>): ExpoConfig {
  const saved = MANAGED_ENV.map((name) => [name, process.env[name]] as const);
  try {
    for (const name of MANAGED_ENV) {
      if (env[name] === undefined) delete process.env[name];
      else process.env[name] = env[name];
    }
    const context: ConfigContext = {
      projectRoot: ROOT,
      staticConfigPath: path.join(ROOT, "app.json"),
      packageJsonPath: path.join(ROOT, "package.json"),
      config: staticConfig.expo as unknown as ConfigContext["config"],
    };
    return appConfig(context);
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function pluginOptions(config: ExpoConfig, plugin: string): Record<string, unknown> {
  const entry = config.plugins?.find((item) => Array.isArray(item) && item[0] === plugin);
  if (!Array.isArray(entry)) throw new Error(`${plugin} is not configured with options`);
  return entry[1] as Record<string, unknown>;
}

describe("app variants", () => {
  it("uses the store identity by default (expo start, eas submit, eas credentials)", () => {
    const config = resolveConfig({});

    expect(config.name).toBe("WALLEX");
    expect(config.ios?.bundleIdentifier).toBe("com.szilard.wallex");
    expect(config.android?.package).toBe("com.szilard.wallex");
  });

  it("gives development and preview builds their own identity, so all three install side by side", () => {
    const development = resolveConfig({ APP_VARIANT: "development" });
    const preview = resolveConfig({ APP_VARIANT: "preview", EXPO_PUBLIC_API_BASE_URL: PRODUCTION_URL });

    expect([development.name, development.ios?.bundleIdentifier, development.android?.package]).toEqual([
      "WALLEX (Dev)",
      "com.szilard.wallex.dev",
      "com.szilard.wallex.dev",
    ]);
    expect([preview.name, preview.ios?.bundleIdentifier, preview.android?.package]).toEqual([
      "WALLEX (Preview)",
      "com.szilard.wallex.preview",
      "com.szilard.wallex.preview",
    ]);
  });

  it("rejects a misspelled variant instead of silently building production", () => {
    expect(() => resolveVariant("staging")).toThrow(/Unknown APP_VARIANT/);
  });
});

describe("production API URL", () => {
  it.each(["preview", "production"])("a %s build without the URL fails at build time", (variant) => {
    expect(() => resolveConfig({ APP_VARIANT: variant })).toThrow(/EXPO_PUBLIC_API_BASE_URL is missing/);
  });

  it("refuses a plain-http or malformed URL for a release build", () => {
    expect(() =>
      resolveConfig({ APP_VARIANT: "production", EXPO_PUBLIC_API_BASE_URL: "http://wallex.example.com/api" })
    ).toThrow(/must use https/);
    expect(() => resolveConfig({ APP_VARIANT: "production", EXPO_PUBLIC_API_BASE_URL: "wallex.example.com" })).toThrow(
      /not a valid URL/
    );
  });

  it("accepts an https URL", () => {
    expect(() => resolveConfig({ APP_VARIANT: "production", EXPO_PUBLIC_API_BASE_URL: PRODUCTION_URL })).not.toThrow();
  });

  it("development builds and `expo start` need no production URL (the dev machine is auto-detected)", () => {
    expect(() => resolveConfig({ APP_VARIANT: "development" })).not.toThrow();
    expect(() => resolveConfig({})).not.toThrow();
  });
});

describe("permissions", () => {
  it("release builds block every Android permission the app never uses", () => {
    const blocked = resolveConfig({ APP_VARIANT: "production", EXPO_PUBLIC_API_BASE_URL: PRODUCTION_URL }).android
      ?.blockedPermissions;

    expect(blocked).toEqual(
      expect.arrayContaining([
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW",
      ])
    );
  });

  it("development builds keep the overlay permission the dev menu needs", () => {
    expect(resolveConfig({ APP_VARIANT: "development" }).android?.blockedPermissions).not.toContain(
      "android.permission.SYSTEM_ALERT_WINDOW"
    );
  });

  it("never asks for the microphone: receipts are photos, not videos", () => {
    expect(pluginOptions(resolveConfig({}), "expo-image-picker").microphonePermission).toBe(false);
  });

  it("release builds drop the dev launcher's local-network permission text; development builds keep it", async () => {
    type InfoPlistMod = (config: unknown) => Promise<{ modResults: Record<string, string> }>;
    // Runs the config's Info.plist mod (what `expo prebuild` does) on a plist containing the dev launcher's key.
    const infoPlistAfterMods = async (config: ExpoConfig) => {
      const plist = { NSLocalNetworkUsageDescription: "Expo Dev Launcher uses the local network…", NSCameraUsageDescription: "…" };
      const mod = (config as { mods?: { ios?: { infoPlist?: InfoPlistMod } } }).mods?.ios?.infoPlist;
      if (!mod) return plist;
      const result = await mod({ modResults: plist, modRequest: { platform: "ios", introspect: true } });
      return result.modResults;
    };

    const release = await infoPlistAfterMods(
      resolveConfig({ APP_VARIANT: "production", EXPO_PUBLIC_API_BASE_URL: PRODUCTION_URL })
    );
    const development = await infoPlistAfterMods(resolveConfig({ APP_VARIANT: "development" }));

    expect(Object.keys(release)).toEqual(["NSCameraUsageDescription"]);
    expect(Object.keys(development)).toContain("NSLocalNetworkUsageDescription");
  });

  it("declares that the app only uses exempt encryption (HTTPS), skipping the export-compliance prompt", () => {
    expect(resolveConfig({}).ios?.config?.usesNonExemptEncryption).toBe(false);
  });
});

describe("no secrets in the app binary", () => {
  const SOURCE_DIRS = ["app", "components", "hooks", "screens", "services", "types", "utils"];

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  it("app code reads no environment variable except the public API URL", () => {
    const names = new Set<string>();
    for (const file of SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/process\.env\.(\w+)|\b(EXPO_PUBLIC_\w+)/g)) {
        names.add(match[1] ?? match[2]!);
      }
    }

    // EXPO_PUBLIC_* values are inlined into the JavaScript bundle: anyone can read them.
    expect([...names]).toEqual(["EXPO_PUBLIC_API_BASE_URL"]);
  });

  it("the resolved app config never copies values from the build environment", () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = "server-only-secret-value";
    try {
      const config = resolveConfig({ APP_VARIANT: "production", EXPO_PUBLIC_API_BASE_URL: PRODUCTION_URL });

      expect(JSON.stringify(config)).not.toContain("server-only-secret-value");
      // `extra` is readable at runtime through expo-constants.
      expect(Object.keys(config.extra ?? {}).filter((key) => !["router", "eas"].includes(key))).toEqual([]);
    } finally {
      delete process.env.EXPO_PUSH_ACCESS_TOKEN;
    }
  });

  it("the Firebase file comes from the build machine (EAS file variable), never the repository", () => {
    expect(resolveConfig({}).android?.googleServicesFile).toBeUndefined();
    expect(resolveConfig({ GOOGLE_SERVICES_JSON: "/eas/tmp/google-services.json" }).android?.googleServicesFile).toBe(
      "/eas/tmp/google-services.json"
    );
  });
});
