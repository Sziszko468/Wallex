import { StyleSheet, Text } from "react-native";
import { colors, fontSize, radius, spacing } from "../utils/theme";

interface ErrorBannerProps {
  message: string | null;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <Text accessibilityRole="alert" style={styles.banner}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: "rgba(220, 38, 38, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.3)",
    borderRadius: radius.sm,
    color: colors.danger,
    fontSize: fontSize.sm,
  },
});
