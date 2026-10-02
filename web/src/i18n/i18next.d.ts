import type { Translations } from "./locales/en";

// Types every t("…") call: an unknown key, or a missing {{variable}}, fails the build.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Translations };
  }
}
