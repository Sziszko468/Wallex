import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { useTheme } from "../../theme";

interface BrandMarkProps {
  size?: number;
  /** Adds an accessible name; decorative (hidden from screen readers) otherwise. */
  title?: string;
}

const NO_POINTER_EVENTS = { pointerEvents: "none" } as const;
const RING = { cx: 12, cy: 12, r: 8 } as const;

/**
 * The WALLEX ring: three unequal arcs — sage for what you keep, teal for saving, sand for what's
 * set aside — with round ends and a slight tilt. The same shape as the web app's favicon and
 * BrandMark, coloured with theme tokens so it stays harmonious in dark mode.
 */
export function BrandMark({ size = 28, title }: BrandMarkProps) {
  const { colors } = useTheme();
  return (
    <View
      accessible={Boolean(title)}
      accessibilityLabel={title}
      accessibilityRole={title ? "image" : undefined}
      importantForAccessibility={title ? "yes" : "no-hide-descendants"}
      accessibilityElementsHidden={!title}
      style={NO_POINTER_EVENTS}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={3.4} strokeLinecap="round">
        <G transform="rotate(-100 12 12)">
          <Circle {...RING} stroke={colors.primary} strokeDasharray="15.08 35.18" />
          <Circle {...RING} stroke={colors.savings} strokeDasharray="10.05 40.21" strokeDashoffset={-21.44} />
          <Circle {...RING} stroke={colors.sand} strokeDasharray="6.03 44.23" strokeDashoffset={-37.85} />
        </G>
      </Svg>
    </View>
  );
}
