import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, space, useTheme } from "../../theme";
import type { AssistantMessage } from "../../types/assistant";
import { Text } from "../ui/Text";
import { FollowUpQuestions } from "./FollowUpQuestions";
import { InsightCards } from "./InsightCards";
import { MarkdownText } from "./MarkdownText";

interface ChatMessageListProps {
  messages: AssistantMessage[];
  /** Asked, answer not here yet. */
  pendingQuestion: string | null;
  /** Sends a follow-up question (the chips under the latest answer). */
  onAsk: (question: string) => void;
  /** False while another answer is on its way, offline, or when the assistant can't be used. */
  canAsk: boolean;
}

const useStyles = makeStyles(({ colors }) => ({
  list: { gap: space[4] },
  row: { maxWidth: "88%", gap: space[2] },
  rowUser: { alignSelf: "flex-end", alignItems: "flex-end" },
  rowAssistant: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { paddingVertical: space[3], paddingHorizontal: space[4], borderRadius: 18 },
  userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  assistantBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  thinking: { flexDirection: "row", alignItems: "center", gap: space[3] },
  sources: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  source: { paddingHorizontal: space[2], paddingVertical: 2, borderRadius: 8, backgroundColor: colors.primarySoft },
}));

function Question({ text }: { text: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <View style={[styles.row, styles.rowUser]} accessibilityLabel={t("assistant.messages.you", { text })}>
      <View style={[styles.bubble, styles.userBubble]}>
        <Text variant="body" color="onPrimary">
          {text}
        </Text>
      </View>
    </View>
  );
}

interface AnswerProps {
  message: AssistantMessage;
  /** The latest answer offers its follow-up questions. */
  followUps?: { onAsk: (question: string) => void; canAsk: boolean };
}

function Answer({ message, followUps }: AnswerProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <View style={[styles.row, styles.rowAssistant]}>
      <View style={[styles.bubble, styles.assistantBubble]}>
        <MarkdownText text={message.content} />
      </View>
      {message.sources.length > 0 ? (
        <View style={styles.sources} accessibilityLabel={t("assistant.messages.basedOn")}>
          <Text variant="small" color="textTertiary">
            {t("assistant.messages.basedOnLabel")}
          </Text>
          {message.sources.map((source, index) => (
            <View key={index} style={styles.source}>
              <Text variant="small" color="primaryInk">
                {source.label}
                {source.detail ? <Text variant="small" color="textSecondary"> · {source.detail}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <InsightCards insights={message.insights} />
      {followUps ? (
        <FollowUpQuestions questions={message.suggested_questions} onPick={followUps.onAsk} disabled={!followUps.canAsk} />
      ) : null}
    </View>
  );
}

export function ChatMessageList({ messages, pendingQuestion, onAsk, canAsk }: ChatMessageListProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {messages.map((message, index) => {
        if (message.role === "user") return <Question key={message.id} text={message.content} />;
        // Only the latest answer offers follow-ups, and not while the next one is being prepared.
        const isLatest = index === messages.length - 1 && pendingQuestion === null;
        return <Answer key={message.id} message={message} followUps={isLatest ? { onAsk, canAsk } : undefined} />;
      })}
      {pendingQuestion !== null ? (
        <>
          <Question text={pendingQuestion} />
          <View style={[styles.row, styles.rowAssistant]}>
            <View style={[styles.bubble, styles.assistantBubble, styles.thinking]} accessibilityRole="progressbar" accessibilityLabel={t("assistant.messages.thinking")}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text variant="caption" color="textSecondary">
                {t("assistant.messages.thinkingText")}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}
