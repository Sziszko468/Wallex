import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { layout, makeStyles, radius, space } from "../../theme";
import { Text } from "../ui/Text";

interface FollowUpQuestionsProps {
  questions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}

const DISABLED_OPACITY = 0.55;

const useStyles = makeStyles(({ colors }) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  // The question may be long: it wraps instead of being cut off.
  chip: {
    maxWidth: "100%",
    minHeight: layout.minTouch,
    justifyContent: "center",
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
}));

/** What to ask next, under the latest answer: one tap sends the question. */
export function FollowUpQuestions({ questions, onPick, disabled = false }: FollowUpQuestionsProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  if (questions.length === 0) return null;
  return (
    <View style={styles.chips} accessibilityLabel={t("assistant.messages.followUps")}>
      {questions.map((question) => (
        <Pressable
          key={question}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onPick(question)}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed, disabled && { opacity: DISABLED_OPACITY }]}
        >
          <Text variant="label" color="primaryInk">
            {question}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
