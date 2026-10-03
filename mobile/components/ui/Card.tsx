import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles, radius, space } from "../../theme";

interface CardProps {
  children: ReactNode;
  /** default: the surface · wash: the warm sage panel of the balance · flat: no border, for nested panels. */
  tone?: "default" | "wash" | "flat";
  /** An inner padding step from the space scale; 0 for content that brings its own (lists). */
  padding?: 0 | 3 | 4 | 5 | 6;
  style?: StyleProp<ViewStyle>;
}

const useStyles = makeStyles(({ colors }) => ({
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  default: { backgroundColor: colors.surface, borderColor: colors.border },
  wash: { backgroundColor: colors.washSage, borderColor: colors.border },
  flat: { backgroundColor: colors.surfaceSubtle, borderColor: "transparent" },
}));

/** A grouped piece of content. Cards are used where they help grouping — not around everything. */
export function Card({ children, tone = "default", padding = 4, style }: CardProps) {
  const styles = useStyles();
  return <View style={[styles.card, styles[tone], { padding: space[padding] }, style]}>{children}</View>;
}
