import { getLocales } from "expo-localization";

/** The languages the interface is available in. Add a code here, then a catalog in ./locales. */
export const SUPPORTED_LANGUAGES = ["en", "hu"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

/**
 * Each language is named in itself and never translated: someone who can't read the current
 * interface language must still be able to find their own.
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  hu: "Magyar",
};

/** The BCP 47 tag Intl uses to format numbers, currencies and dates for each language. */
export const INTL_LOCALES: Record<Language, string> = {
  en: "en-GB",
  hu: "hu-HU",
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** "hu-HU" → "hu"; null when the tag isn't one of ours. */
export function languageFromTag(tag: string): Language | null {
  const primary = tag.toLowerCase().split("-")[0];
  return isLanguage(primary) ? primary : null;
}

/** The first of the device's preferred languages that we offer, in the device's order. */
export function pickSupportedLanguage(preferred: readonly string[]): Language | null {
  for (const tag of preferred) {
    const language = languageFromTag(tag);
    if (language) return language;
  }
  return null;
}

/** What the app starts in before a saved choice is read: the device's language, else English. */
export function detectDeviceLanguage(): Language {
  const tags = getLocales().map((locale) => locale.languageTag);
  return pickSupportedLanguage(tags) ?? DEFAULT_LANGUAGE;
}
