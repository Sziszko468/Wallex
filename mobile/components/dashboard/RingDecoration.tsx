import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { useTheme } from "../../theme";

interface RingDecorationProps {
  size?: number;
}

const NO_POINTER_EVENTS = { pointerEvents: "none" } as const;
const RING = { cx: 12, cy: 12, r: 8 } as const;
const STROKE_OPACITY = 0.16;

/**
 * The brand ring, drawn large and faint behind the balance. Pure decoration (it carries no
 * information and is hidden from screen readers), and quiet enough never to sit behind small text.
 */
export function RingDecoration({ size = 200 }: RingDecorationProps) {
  const { colors } = useTheme();
  return (
    <View style={NO_POINTER_EVENTS} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={2.6} strokeLinecap="round" strokeOpacity={STROKE_OPACITY}>
        <G transform="rotate(-100 12 12)">
          <Circle {...RING} stroke={colors.primary} strokeDasharray="15.08 35.18" />
          <Circle {...RING} stroke={colors.savings} strokeDasharray="10.05 40.21" strokeDashoffset={-21.44} />
          <Circle {...RING} stroke={colors.sand} strokeDasharray="6.03 44.23" strokeDashoffset={-37.85} />
        </G>
      </Svg>
    </View>
  );
}
