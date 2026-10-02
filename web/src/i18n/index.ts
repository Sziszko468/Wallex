import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { APP_NAME } from "../config/app";
import { DEFAULT_LANGUAGE, INTL_LOCALES, SUPPORTED_LANGUAGES, detectLanguage, type Language, isLanguage } from "./languages";
import { resources } from "./locales";

void i18next.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  initAsync: false, // the catalogs are bundled: ready before the first render
  interpolation: {
    escapeValue: false, // React escapes what it renders
    defaultVariables: { appName: APP_NAME }, // so any text can say {{appName}}
  },
});

/** The page's own language and description follow the interface language (index.html has English fallbacks). */
function syncDocument(language: string) {
  document.documentElement.lang = language;
  document.querySelector('meta[name="description"]')?.setAttribute("content", i18next.t("common.metaDescription"));
}

syncDocument(i18next.language);
i18next.on("languageChanged", syncDocument);

export { i18next as i18n };

/** The language the interface is showing right now. */
export function currentLanguage(): Language {
  return isLanguage(i18next.language) ? i18next.language : DEFAULT_LANGUAGE;
}

/** The locale tag for Intl: numbers, currencies and dates follow the interface language. */
export function currentLocale(): string {
  return INTL_LOCALES[currentLanguage()];
}
