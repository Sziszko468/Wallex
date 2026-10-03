import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View, type DimensionValue } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, motion, radius, space, useReducedMotion } from "../../theme";

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}

const PULSE_MS = motion.slow * 3;

const useStyles = makeStyles(({ colors }) => ({
  block: { backgroundColor: colors.skeletonBase },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] },
  lines: { flex: 1, gap: space[2] },
}));

/**
 * A placeholder the size of what is coming, so the screen doesn't jump when data arrives. It
 * breathes slowly; with Reduce Motion on it just sits there.
 */
export function Skeleton({ width = "100%", height = 14, radius: cornerRadius = radius.sm }: SkeletonProps) {
  const styles = useStyles();
  const isReduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isReduced) {
      opacity.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(opacity, { toValue: 1, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isReduced, opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius: cornerRadius, opacity }]}
    />
  );
}

/** Placeholder for a list of rows: a tile, two lines and a figure — what a transaction row looks like. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <View accessibilityLabel={t("common.states.loading")} accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.row}>
          <Skeleton width={40} height={40} radius={radius.md} />
          <View style={styles.lines}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="35%" height={11} />
          </View>
          <Skeleton width={64} height={14} />
        </View>
      ))}
    </View>
  );
}
