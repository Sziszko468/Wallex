import { useTranslation } from "react-i18next";
import { useTheme, type ThemePreference } from "../hooks/useTheme";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

interface ThemeSelectorProps {
  size?: "sm" | "md";
  fullWidth?: boolean;
}

/** System / Light / Dark. "System" follows the device, even while the app is open. */
export function ThemeSelector({ size = "md", fullWidth = false }: ThemeSelectorProps) {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const options: readonly SegmentedOption<ThemePreference>[] = [
    { value: "system", label: t("common.theme.system"), icon: "monitor" },
    { value: "light", label: t("common.theme.light"), icon: "sun" },
    { value: "dark", label: t("common.theme.dark"), icon: "moon" },
  ];
  return (
    <SegmentedControl
      options={options}
      value={preference}
      onChange={setPreference}
      label={t("common.theme.label")}
      size={size}
      fullWidth={fullWidth}
    />
  );
}
