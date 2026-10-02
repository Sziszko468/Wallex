import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

interface SuggestedQuestionsProps {
  questions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}

export function SuggestedQuestions({ questions, onPick, disabled = false }: SuggestedQuestionsProps) {
  const { t } = useTranslation();
  if (questions.length === 0) return null;
  return (
    <View style={styles.container} accessibilityLabel={t("assistant.suggestions.label")}>
      <Text style={styles.heading}>{t("assistant.suggestions.heading")}</Text>
      {questions.map((question) => (
        <Pressable
          key={question}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onPick(question)}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed, disabled && styles.disabled]}
        >
          <Text style={styles.chipText}>{question}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  heading: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.textMuted,
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  pressed: {
    borderColor: colors.primary,
    backgroundColor: "rgba(99, 102, 241, 0.05)",
  },
  disabled: {
    opacity: 0.6,
  },
});
