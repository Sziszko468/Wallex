import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { AssistantMessage } from "../../types/assistant";
import { colors, fontSize, spacing } from "../../utils/theme";
import { MarkdownText } from "./MarkdownText";

interface ChatMessageListProps {
  messages: AssistantMessage[];
  /** Asked, answer not here yet. */
  pendingQuestion: string | null;
}

function Question({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.row, styles.rowUser]} accessibilityLabel={t("assistant.messages.you", { text })}>
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{text}</Text>
      </View>
    </View>
  );
}

function Answer({ message }: { message: AssistantMessage }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.row, styles.rowAssistant]}>
      <View style={[styles.bubble, styles.assistantBubble]}>
        <MarkdownText text={message.content} />
      </View>
      {message.sources.length > 0 && (
        <View style={styles.sources} accessibilityLabel={t("assistant.messages.basedOn")}>
          <Text style={styles.sourcesLabel}>{t("assistant.messages.basedOnLabel")}</Text>
          {message.sources.map((source, index) => (
            <Text key={index} style={styles.source}>
              {source.label}
              {source.detail ? <Text style={styles.sourceDetail}> · {source.detail}</Text> : null}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export function ChatMessageList({ messages, pendingQuestion }: ChatMessageListProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.list}>
      {messages.map((message) =>
        message.role === "user" ? (
          <Question key={message.id} text={message.content} />
        ) : (
          <Answer key={message.id} message={message} />
        )
      )}
      {pendingQuestion !== null && (
        <>
          <Question text={pendingQuestion} />
          <View style={[styles.row, styles.rowAssistant]}>
            <View
              style={[styles.bubble, styles.assistantBubble, styles.thinking]}
              accessibilityRole="progressbar"
              accessibilityLabel={t("assistant.messages.thinking")}
            >
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text style={styles.thinkingText}>{t("assistant.messages.thinkingText")}</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  row: {
    maxWidth: "88%",
    gap: spacing.xs,
  },
  rowUser: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  rowAssistant: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  userText: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 22,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  sources: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  sourcesLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  source: {
    fontSize: 12,
    color: colors.primaryDark,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  sourceDetail: {
    color: colors.textMuted,
  },
  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  thinkingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
