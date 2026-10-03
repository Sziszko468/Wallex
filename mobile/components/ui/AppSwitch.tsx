import { Switch } from "react-native";
import { useTheme } from "../../theme";

interface AppSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** What the switch controls: read by screen readers together with its on/off state. */
  accessibilityLabel: string;
  disabled?: boolean;
}

/** The platform's own switch, in the app's colours: sage when on, a neutral track when off. */
export function AppSwitch({ value, onValueChange, accessibilityLabel, disabled }: AppSwitchProps) {
  const { colors } = useTheme();
  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ true: colors.primary, false: colors.controlBorder }}
      thumbColor={colors.surfaceRaised}
      ios_backgroundColor={colors.controlBorder}
    />
  );
}
