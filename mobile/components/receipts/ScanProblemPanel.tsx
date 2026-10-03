import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, radius, space, useTheme } from "../../theme";
import type { ProblemAction, ScanProblem } from "../../utils/receiptProblems";
import { Icon } from "../icons/Icon";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";

interface ScanProblemPanelProps {
  problem: ScanProblem;
  photoUri?: string;
  onAction: (action: ProblemAction) => void;
}

const useStyles = makeStyles(({ colors }) => ({
  thumbnail: { width: "100%", height: 160, borderRadius: radius.lg, backgroundColor: colors.bgSubtle, marginBottom: space[5] },
  tile: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, backgroundColor: colors.warningSoft, marginBottom: space[4] },
  text: { gap: space[2], marginBottom: space[6] },
  actions: { gap: space[3] },
}));

/** Why the scan didn't produce something to review, and the ways forward. Nothing was saved. */
export function ScanProblemPanel({ problem, photoUri, onAction }: ScanProblemPanelProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View accessibilityRole="alert">
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.thumbnail} resizeMode="contain" /> : null}
      <View style={styles.tile}>
        <Icon name="alert-triangle" size={26} color={colors.warning} />
      </View>
      <View style={styles.text}>
        <Text variant="title" header>
          {problem.title}
        </Text>
        <Text variant="body" color="textSecondary">
          {problem.message}
        </Text>
      </View>
      <View style={styles.actions}>
        {problem.actions.map((action, index) => (
          <Button
            key={action}
            title={t(`receipts.problems.actions.${action}`)}
            variant={index === 0 ? "primary" : "secondary"}
            size={index === 0 ? "large" : "medium"}
            onPress={() => onAction(action)}
          />
        ))}
      </View>
    </View>
  );
}
