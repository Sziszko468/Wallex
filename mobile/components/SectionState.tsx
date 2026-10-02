import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ErrorBanner } from "./ErrorBanner";
import { extractErrorMessage } from "../utils/errors";
import { colors, fontSize, spacing } from "../utils/theme";

interface SectionStateProps {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}

/** Shared loading/error/content switch used by every independent dashboard section. */
export function SectionState({ isLoading, error, onRetry, children }: SectionStateProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View>
        <ErrorBanner message={extractErrorMessage(error)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.retry")}
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryText}>{t("common.actions.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  retry: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  retryPressed: {
    opacity: 0.6,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
});
