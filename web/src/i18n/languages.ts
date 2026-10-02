/** The languages the interface is available in. Add a code here, then a catalog in ./locales. */
export const SUPPORTED_LANGUAGES = ["en", "hu"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

export const LANGUAGE_STORAGE_KEY = "wallex-language";

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

/** The first of the browser's preferred languages that we offer, in the browser's order. */
export function pickSupportedLanguage(preferred: readonly string[]): Language | null {
  for (const tag of preferred) {
    const language = languageFromTag(tag);
    if (language) return language;
  }
  return null;
}

export function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null; // storage blocked: fall back to the browser's language
  }
}

export function storeLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Blocked storage: the choice lasts until the page is closed.
  }
}

/** What the page starts in: the saved choice, else the browser's language, else English. */
export function detectLanguage(): Language {
  const preferred = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  return readStoredLanguage() ?? pickSupportedLanguage(preferred) ?? DEFAULT_LANGUAGE;
}
