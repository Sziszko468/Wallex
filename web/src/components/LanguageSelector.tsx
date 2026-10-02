import { useTranslation } from "react-i18next";
import { useLanguage } from "../hooks/useLanguage";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type Language } from "../i18n/languages";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

const OPTIONS: readonly SegmentedOption<Language>[] = SUPPORTED_LANGUAGES.map((language) => ({
  value: language,
  label: LANGUAGE_NAMES[language],
}));

interface LanguageSelectorProps {
  size?: "sm" | "md";
  fullWidth?: boolean;
}

/** English / Magyar. Each language is named in itself, so it can always be found. */
export function LanguageSelector({ size = "md", fullWidth = false }: LanguageSelectorProps) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <SegmentedControl
      options={OPTIONS}
      value={language}
      onChange={setLanguage}
      label={t("common.language.label")}
      size={size}
      fullWidth={fullWidth}
    />
  );
}
