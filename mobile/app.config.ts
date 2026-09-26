import type { ConfigContext, ExpoConfig } from "expo/config";
import { type ConfigPlugin, withInfoPlist } from "expo/config-plugins";

/**
 * Dynamic app config. app.json holds the production identity; this file derives the
 * development and preview variants from it (so all three can be installed side by side)
 * and refuses to configure a release build without a valid production API URL.
 *
 * APP_VARIANT is set per build profile in eas.json. Commands that don't build a binary
 * (`expo start`, `eas submit`, `eas credentials`…) leave it unset and get the production
 * identity — exactly what submitting and managing store credentials need.
 *
 * Everything returned here ends up inside the app binary: never read secrets here.
 */

export type AppVariant = "development" | "preview" | "production";

const VARIANTS: Record<AppVariant, { idSuffix: string; nameSuffix: string }> = {
  development: { idSuffix: ".dev", nameSuffix: " (Dev)" },
  preview: { idSuffix: ".preview", nameSuffix: " (Preview)" },
  production: { idSuffix: "", nameSuffix: "" },
};

// Only the development tools need to draw over other apps (dev menu, error overlay).
const RELEASE_BLOCKED_PERMISSIONS = ["android.permission.SYSTEM_ALERT_WINDOW"];

/**
 * expo-dev-client adds a local-network permission text ("Expo Dev Launcher uses the local
 * network…") to every build. Release binaries don't contain the dev launcher, and a store
 * build must not describe a permission it never asks for.
 */
const withoutDevLauncherNetworkPrompt: ConfigPlugin = (config) =>
  withInfoPlist(config, (plistConfig) => {
    delete plistConfig.modResults.NSLocalNetworkUsageDescription;
    return plistConfig;
  });

export function resolveVariant(value: string | undefined): AppVariant {
  if (!value) return "production";
  if (Object.hasOwn(VARIANTS, value)) return value as AppVariant;
  throw new Error(`Unknown APP_VARIANT "${value}" — expected development, preview or production.`);
}

/**
 * A release binary can't be reconfigured after it is installed, and the app refuses a
 * non-https API at startup — so check the URL when building instead of shipping a dud.
 */
export function assertReleaseApiUrl(url: string | undefined, variant: AppVariant): void {
  const hint = `Set EXPO_PUBLIC_API_BASE_URL in the EAS "${variant}" environment (docs/mobile-release.md).`;
  if (!url) {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL is missing for the ${variant} build. ${hint}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL "${url}" is not a valid URL. ${hint}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL must use https for the ${variant} build (got "${url}"). ${hint}`);
  }
}

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) {
    throw new Error(`app.json is missing "${key}".`);
  }
  return value;
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const variant = resolveVariant(process.env.APP_VARIANT);
  const { idSuffix, nameSuffix } = VARIANTS[variant];

  // Only EAS builds set APP_VARIANT, so `expo start` keeps working without a production URL.
  if (process.env.APP_VARIANT && variant !== "development") {
    assertReleaseApiUrl(process.env.EXPO_PUBLIC_API_BASE_URL, variant);
  }

  // Firebase config for Android push, provided as an EAS *file* variable during builds
  // (the path is only known on the build machine). Not committed to the repository.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const isRelease = variant !== "development";

  const resolved: ExpoConfig = {
    ...config,
    name: `${required(config.name, "name")}${nameSuffix}`,
    slug: required(config.slug, "slug"),
    ios: {
      ...config.ios,
      bundleIdentifier: `${required(config.ios?.bundleIdentifier, "ios.bundleIdentifier")}${idSuffix}`,
    },
    android: {
      ...config.android,
      package: `${required(config.android?.package, "android.package")}${idSuffix}`,
      blockedPermissions: [
        ...(config.android?.blockedPermissions ?? []),
        ...(isRelease ? RELEASE_BLOCKED_PERMISSIONS : []),
      ],
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
  return isRelease ? withoutDevLauncherNetworkPrompt(resolved) : resolved;
}
