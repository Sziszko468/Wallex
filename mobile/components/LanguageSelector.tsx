import { useTranslation } from "react-i18next";
import { useLanguage } from "../hooks/useLanguage";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from "../i18n/languages";
import { SegmentedControl, type SegmentedOption } from "./ui/SegmentedControl";
import type { Language } from "../i18n/languages";

/** English / Magyar. Each language is named in itself, so it can always be found. */
export function LanguageSelector() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const options: SegmentedOption<Language>[] = SUPPORTED_LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] }));

  return <SegmentedControl options={options} value={language} onChange={setLanguage} accessibilityLabel={t("common.language.label")} />;
}
