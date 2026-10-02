import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { APP_NAME } from "../config/app";
import { DEFAULT_LANGUAGE, INTL_LOCALES, SUPPORTED_LANGUAGES, detectDeviceLanguage, isLanguage, type Language } from "./languages";
import { resources } from "./locales";

void i18next.use(initReactI18next).init({
  resources,
  lng: detectDeviceLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  initAsync: false, // the catalogs are bundled: ready before the first render
  interpolation: {
    escapeValue: false, // React Native doesn't interpret markup
    defaultVariables: { appName: APP_NAME }, // so any text can say {{appName}}
  },
});

export { i18next as i18n };

/** The language the interface is showing right now. */
export function currentLanguage(): Language {
  return isLanguage(i18next.language) ? i18next.language : DEFAULT_LANGUAGE;
}

/** The locale tag for Intl: numbers, currencies and dates follow the interface language. */
export function currentLocale(): string {
  return INTL_LOCALES[currentLanguage()];
}
