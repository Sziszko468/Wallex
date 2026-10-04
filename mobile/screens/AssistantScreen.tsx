import { useCallback, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useAssistantChat } from "../hooks/useAssistantChat";
import { useConversationHistory } from "../hooks/useConversationHistory";
import { useOffline } from "../hooks/useOffline";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { deleteConversation, getAssistantStatus } from "../services/assistantService";
import type { AssistantConversationSummary, AssistantExchange } from "../types/assistant";
import { extractErrorMessage, isNotFound } from "../utils/errors";
import { fontFamilies, layout, makeStyles, space, useTheme } from "../theme";
import { ErrorBanner } from "../components/ErrorBanner";
import { SectionState } from "../components/SectionState";
import { ChatMessageList } from "../components/assistant/ChatMessageList";
import { ConversationHistoryModal } from "../components/assistant/ConversationHistoryModal";
import { SuggestedQuestions } from "../components/assistant/SuggestedQuestions";
import { BrandMark } from "../components/icons/BrandMark";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { Notice } from "../components/ui/Notice";
import { Text } from "../components/ui/Text";

const DEFAULT_MAX_LENGTH = 1000;

export function AssistantScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
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
      return (
        <Text variant="body" color="textSecondary">
          {t("assistant.gone")}
        </Text>
      );
    }
    return (
      <SectionState isLoading={chat.isLoading} error={chat.loadError} onRetry={chat.reload}>
        {isNewChat ? (
          <View style={styles.welcome}>
            <BrandMark size={44} />
            <Text variant="title" header>
              {t("assistant.welcome")}
            </Text>
            <Text variant="body" color="textSecondary">
              {t("assistant.description")}
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
          <ChatMessageList
            messages={chat.messages}
            pendingQuestion={chat.pendingQuestion}
            onAsk={(question) => void ask(question)}
            canAsk={canType}
          />
        )}
      </SectionState>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <View ref={frameRef} style={styles.flex} onLayout={measureFrame}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={keyboardOffset}>
          <View style={styles.toolbar}>
            <Button title={t("assistant.toolbar.history")} accessibilityLabel={t("assistant.toolbar.historyLabel")} variant="secondary" icon="clock" onPress={() => setIsHistoryOpen(true)} />
            <Button title={t("assistant.toolbar.newChat")} variant="ghost" icon="plus" onPress={startNewChat} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.thread}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {status.data && !status.data.available ? <Notice tone="warning" message={t("assistant.notConfigured")} /> : null}
            <ErrorBanner message={deleteError} />
            {renderThread()}
          </ScrollView>

          <View style={styles.composerArea}>
            <ErrorBanner message={chat.sendError} />
            {isOffline ? (
              <Text variant="caption" color="textSecondary">
                {t("assistant.offline")}
              </Text>
            ) : null}
            <View style={styles.composer}>
              <TextInput
                accessibilityLabel={t("assistant.composer.label")}
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder={t("assistant.composer.placeholder")}
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.primary}
                multiline
                numberOfLines={1}
                maxLength={maxLength}
                editable={canType}
                maxFontSizeMultiplier={1.4}
              />
              <IconButton icon="arrow-up" variant="filled" accessibilityLabel={t("assistant.composer.send")} disabled={!canSend} onPress={() => void ask(draft)} />
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

const useStyles = makeStyles(({ colors }) => ({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: layout.screenPadding, paddingTop: space[2] },
  thread: { flexGrow: 1, padding: layout.screenPadding },
  welcome: { gap: space[4], paddingTop: space[4] },
  composerArea: {
    gap: space[2],
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[3],
    paddingBottom: space[3],
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surfaceRaised,
  },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space[2] },
  input: {
    flex: 1,
    minHeight: layout.minTouch,
    maxHeight: 120,
    paddingHorizontal: space[4],
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
  },
}));
