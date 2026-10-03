import { useTranslation } from "react-i18next";
import { useTheme } from "../theme";
import type { ThemePreference } from "../theme";
import { SegmentedControl, type SegmentedOption } from "./ui/SegmentedControl";

/**
 * System / Light / Dark. "System" follows the phone and changes with it, live; Light and Dark are
 * fixed choices the phone's setting never overrides. The choice is kept on the device.
 */
export function ThemeSelector() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const options: SegmentedOption<ThemePreference>[] = [
    { value: "system", label: t("settings.appearance.system"), icon: "monitor" },
    { value: "light", label: t("settings.appearance.light"), icon: "sun" },
    { value: "dark", label: t("settings.appearance.dark"), icon: "moon" },
  ];
  return <SegmentedControl options={options} value={preference} onChange={setPreference} accessibilityLabel={t("settings.appearance.theme")} />;
}
