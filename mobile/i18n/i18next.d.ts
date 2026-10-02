import type { Translations } from "./locales/en";

// Types every t("…") call: an unknown key fails the type check.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Translations };
  }
}
