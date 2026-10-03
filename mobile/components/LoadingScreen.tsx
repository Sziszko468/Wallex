import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, space, useTheme } from "../theme";
import { BrandMark } from "./icons/BrandMark";
import { Text } from "./ui/Text";

interface LoadingScreenProps {
  label?: string;
}

const useStyles = makeStyles(({ colors }) => ({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[4], backgroundColor: colors.bg },
}));

/** Full-screen waiting state — only for the very start (checking the session). Everything else uses skeletons. */
export function LoadingScreen({ label }: LoadingScreenProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label ?? t("common.states.loading")}>
      <BrandMark size={56} />
      <ActivityIndicator color={colors.primary} />
      <Text variant="caption" color="textSecondary">
        {label ?? t("common.states.loading")}
      </Text>
    </View>
  );
}
