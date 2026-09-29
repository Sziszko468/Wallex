import { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAsyncData } from "../hooks/useAsyncData";
import { useAssistantChat } from "../hooks/useAssistantChat";
import { useConversationHistory } from "../hooks/useConversationHistory";
import { useOffline } from "../hooks/useOffline";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { deleteConversation, getAssistantStatus } from "../services/assistantService";
import type { AssistantConversationSummary, AssistantExchange } from "../types/assistant";
import { extractErrorMessage, isNotFound } from "../utils/errors";
import { colors, fontSize, radius, spacing } from "../utils/theme";
import { ErrorBanner } from "../components/ErrorBanner";
import { SectionState } from "../components/SectionState";
import { ChatMessageList } from "../components/assistant/ChatMessageList";
import { ConversationHistoryModal } from "../components/assistant/ConversationHistoryModal";
import { SuggestedQuestions } from "../components/assistant/SuggestedQuestions";

const DEFAULT_MAX_LENGTH = 1000;

export function AssistantScreen() {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { isOffline } = useOffline();

  const status = useAsyncData(useCallback(() => getAssistantStatus(), []), { live: false });
  const history = useConversationHistory();
  const { moveToTop, remove } = history;
  // Suggestions follow the user's data; the history may have grown on another device.
  useRefetchOnFocus(() => {
    void status.revalidate();
    history.refetch();
  });

  const handleAnswered = useCallback(
    (exchange: AssistantExchange, isNew: boolean) => {
      moveToTop(exchange.conversation);
      if (isNew) setConversationId(exchange.conversation.id);
    },
    [moveToTop]
  );
  const chat = useAssistantChat(conversationId, handleAnswered);

  // KeyboardAvoidingView needs its distance from the top of the window (header, banners above it).
  const frameRef = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const measureFrame = useCallback(() => {
    frameRef.current?.measureInWindow((_x, y) => setKeyboardOffset(y));
  }, []);

  const scrollRef = useRef<ScrollView>(null);

  async function ask(text: string) {
    setDraft("");
    const outcome = await chat.send(text);
    // Not sent: the question goes back into the box, ready to send again.
    if (outcome === "failed") setDraft((current) => current || text);
  }

  async function handleDelete(conversation: AssistantConversationSummary) {
    setDeleteError(null);
    try {
      await deleteConversation(conversation.id);
    } catch (error) {
      if (!isNotFound(error)) {
        setDeleteError(extractErrorMessage(error));
        return;
      }
    }
    remove(conversation.id);
    if (conversation.id === conversationId) setConversationId(null);
  }

  function openConversation(conversation: AssistantConversationSummary) {
    setIsHistoryOpen(false);
    setDraft("");
    setConversationId(conversation.id);
  }

  function startNewChat() {
    setDraft("");
    setConversationId(null);
  }

  const available = status.data?.available ?? true;
  const maxLength = status.data?.max_question_length ?? DEFAULT_MAX_LENGTH;
  const canType = available && !isOffline && !chat.isAsking && !chat.isLoading && chat.loadError === null;
  const canSend = canType && draft.trim().length > 0;
  const isNewChat = conversationId === null && chat.messages.length === 0 && !chat.isAsking;

  function renderThread() {
    if (chat.loadError && isNotFound(chat.loadError)) {
      return <Text style={styles.muted}>This conversation no longer exists — it may have been deleted on another device.</Text>;
    }
    return (
      <SectionState isLoading={chat.isLoading} error={chat.loadError} onRetry={chat.reload}>
        {isNewChat ? (
          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>What would you like to know about your money?</Text>
            <Text style={styles.muted}>
              Ask about your spending, budgets, subscriptions and savings goals. Answers are based only on your Spendly
              data.
            </Text>
            {!status.isLoading && (
              <SuggestedQuestions
                questions={status.data?.suggested_questions ?? []}
                onPick={(question) => void ask(question)}
                disabled={!canType}
              />
            )}
          </View>
        ) : (
          <ChatMessageList messages={chat.messages} pendingQuestion={chat.pendingQuestion} />
        )}
      </SectionState>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <View ref={frameRef} style={styles.flex} onLayout={measureFrame}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={keyboardOffset}
        >
          <View style={styles.toolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Conversation history"
              onPress={() => setIsHistoryOpen(true)}
              style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}
            >
              <Text style={styles.toolbarText}>History</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={startNewChat}
              style={({ pressed }) => [styles.toolbarButton, styles.newChat, pressed && styles.pressed]}
            >
              <Text style={[styles.toolbarText, styles.newChatText]}>New chat</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.thread}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {status.data && !status.data.available && (
              <Text style={styles.notice} accessibilityRole="alert">
                The AI assistant isn&apos;t set up on this server yet.
              </Text>
            )}
            <ErrorBanner message={deleteError} />
            {renderThread()}
          </ScrollView>

          <View style={styles.composerArea}>
            <ErrorBanner message={chat.sendError} />
            {isOffline && <Text style={styles.muted}>You&apos;re offline — the assistant needs a connection.</Text>}
            <View style={styles.composer}>
              <TextInput
                accessibilityLabel="Ask about your finances"
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask about your spending…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={maxLength}
                editable={canType}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={() => void ask(draft)}
                style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && styles.pressed]}
              >
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      <ConversationHistoryModal
        visible={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        conversations={history.conversations}
        isLoading={history.isLoading}
        error={history.error}
        onRetry={history.refetch}
        hasMore={history.nextPage !== null}
        isLoadingMore={history.isLoadingMore}
        onLoadMore={history.loadMore}
        activeId={conversationId}
        onOpen={openConversation}
        onDelete={(conversation) => void handleDelete(conversation)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  toolbarButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toolbarText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
  },
  newChat: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  newChatText: {
    color: "#fff",
  },
  pressed: {
    opacity: 0.8,
  },
  thread: {
    flexGrow: 1,
    padding: spacing.md,
  },
  notice: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.warning,
    backgroundColor: "rgba(217, 119, 6, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(217, 119, 6, 0.3)",
    borderRadius: radius.sm,
  },
  welcome: {
    gap: spacing.md,
  },
  welcomeTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
  },
  muted: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  composerArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
  },
  send: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
  sendDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
});
