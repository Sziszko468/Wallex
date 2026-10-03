import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { layout, makeStyles, radius, space, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import { Text } from "../ui/Text";

interface SuggestedQuestionsProps {
  questions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: space[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: layout.minTouch + 8,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
}));

/** Questions the person is likely to have, written from their own data: one tap asks one. */
export function SuggestedQuestions({ questions, onPick, disabled = false }: SuggestedQuestionsProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  if (questions.length === 0) return null;
  return (
    <View style={styles.container} accessibilityLabel={t("assistant.suggestions.label")}>
      <Text variant="overline" color="textTertiary">
        {t("assistant.suggestions.heading")}
      </Text>
      {questions.map((question) => (
        <Pressable
          key={question}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onPick(question)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && { opacity: 0.55 }]}
        >
          <Text variant="body" style={{ flex: 1 }}>
            {question}
          </Text>
          <Icon name="arrow-up-right" size={18} color={colors.primaryInk} />
        </Pressable>
      ))}
    </View>
  );
}
