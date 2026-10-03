import { View } from "react-native";
import Svg from "react-native-svg";
import { useTheme } from "../../theme";
import { ICON_PATHS, type IconName } from "./iconPaths";

const NO_POINTER_EVENTS = { pointerEvents: "none" } as const;

interface IconProps {
  name: IconName;
  size?: number;
  /** Defaults to the primary text colour. */
  color?: string;
  strokeWidth?: number;
  /** Gives the icon an accessible name. Without it the icon is decorative and hidden from screen readers. */
  title?: string;
}

/**
 * One line-icon from the WALLEX set (see iconPaths.tsx). The accessibility props sit on a plain
 * View around the drawing, which every platform understands; the drawing itself is only paint.
 */
export function Icon({ name, size = 20, color, strokeWidth = 1.75, title }: IconProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.text;
  return (
    <View
      accessible={Boolean(title)}
      accessibilityLabel={title}
      accessibilityRole={title ? "image" : undefined}
      importantForAccessibility={title ? "yes" : "no-hide-descendants"}
      accessibilityElementsHidden={!title}
      style={NO_POINTER_EVENTS}
    >
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        color={stroke}
      >
        {ICON_PATHS[name]}
      </Svg>
    </View>
  );
}
