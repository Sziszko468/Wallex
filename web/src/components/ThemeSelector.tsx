import { useTheme, type ThemePreference } from "../hooks/useTheme";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

const OPTIONS: readonly SegmentedOption<ThemePreference>[] = [
  { value: "system", label: "System", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

interface ThemeSelectorProps {
  size?: "sm" | "md";
  fullWidth?: boolean;
}

/** System / Light / Dark. "System" follows the device, even while the app is open. */
export function ThemeSelector({ size = "md", fullWidth = false }: ThemeSelectorProps) {
  const { preference, setPreference } = useTheme();
  return (
    <SegmentedControl
      options={OPTIONS}
      value={preference}
      onChange={setPreference}
      label="Theme"
      size={size}
      fullWidth={fullWidth}
    />
  );
}
