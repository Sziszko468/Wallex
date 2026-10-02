import { en } from "./en";
import { hu } from "./hu";
import type { Language } from "../languages";

/** One "translation" namespace per language; the catalogs are bundled, so switching is instant. */
export const resources = {
  en: { translation: en },
  hu: { translation: hu },
} satisfies Record<Language, { translation: unknown }>;
