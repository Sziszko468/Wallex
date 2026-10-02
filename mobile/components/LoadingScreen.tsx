import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, fontSize, spacing } from "../utils/theme";

interface LoadingScreenProps {
  label?: string;
}

export function LoadingScreen({ label }: LoadingScreenProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.label}>{label ?? t("common.states.loading")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
});
