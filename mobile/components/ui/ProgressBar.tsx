import { View } from "react-native";
import { makeStyles, radius, useTheme, type Palette } from "../../theme";
import { FULL_PERCENT } from "../../config/budget";

export type ProgressTone = "primary" | "success" | "warning" | "danger" | "savings";

interface ProgressBarProps {
  /** 0–100, as the API sent it. It may exceed 100; only the bar is clamped. */
  percentage: number;
  tone?: ProgressTone;
  /** Where the budget "should" be by today (a thin tick on the track), as 0–100. */
  markerPercentage?: number;
  height?: number;
  /** Names the bar for screen readers ("Food budget used"). */
  accessibilityLabel?: string;
  /** A category colour, when the bar belongs to one (overrides the tone). */
  color?: string;
}

// Bars use the calmer chart tones (they only need 3:1 against the track), not the text colours.
const TONE_COLOR: Record<ProgressTone, keyof Palette> = {
  primary: "primary",
  success: "chartIncome",
  warning: "chartWarning",
  danger: "chartExpense",
  savings: "chartSavings",
};

const useStyles = makeStyles(({ colors }) => ({
  track: { backgroundColor: colors.bgSubtle, borderRadius: radius.full, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.full },
  marker: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: colors.text, opacity: 0.35 },
}));

/** A slim, quiet progress bar. The numbers beside it say the same thing in words. */
export function ProgressBar({ percentage, tone = "primary", markerPercentage, height = 8, accessibilityLabel, color }: ProgressBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const clamped = Math.min(FULL_PERCENT, Math.max(0, percentage));
  return (
    <View
      accessible
      style={[styles.track, { height }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: FULL_PERCENT, now: Math.round(clamped) }}
    >
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color ?? colors[TONE_COLOR[tone]] }]} />
      {markerPercentage !== undefined && markerPercentage > 0 && markerPercentage < FULL_PERCENT ? (
        <View style={[styles.marker, { left: `${markerPercentage}%` }]} />
      ) : null}
    </View>
  );
}
