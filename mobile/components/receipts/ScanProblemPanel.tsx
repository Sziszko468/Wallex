import { Image, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "../Button";
import { colors, fontSize, radius, spacing } from "../../utils/theme";
import type { ProblemAction, ScanProblem } from "../../utils/receiptProblems";

interface ScanProblemPanelProps {
  problem: ScanProblem;
  photoUri?: string;
  onAction: (action: ProblemAction) => void;
}

/** Why the scan didn't produce something to review, and the ways forward. Nothing was saved. */
export function ScanProblemPanel({ problem, photoUri, onAction }: ScanProblemPanelProps) {
  const { t } = useTranslation();
  return (
    <View accessibilityRole="alert">
      {photoUri && <Image source={{ uri: photoUri }} style={styles.thumbnail} resizeMode="contain" />}
      <Text style={styles.title}>{problem.title}</Text>
      <Text style={styles.message}>{problem.message}</Text>
      {problem.actions.map((action, index) => (
        <View key={action} style={styles.action}>
          <Button
            title={t(`receipts.problems.actions.${action}`)}
            variant={index === 0 ? "primary" : "secondary"}
            size={index === 0 ? "large" : "medium"}
            onPress={() => onAction(action)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: "100%",
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  action: {
    marginBottom: spacing.sm,
  },
});
