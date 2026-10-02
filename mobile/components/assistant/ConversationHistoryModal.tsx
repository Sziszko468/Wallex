import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { t as translate } from "i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AssistantConversationSummary } from "../../types/assistant";
import { currentLocale } from "../../i18n";
import { formatClockTime } from "../../utils/format";
import { colors, fontSize, radius, spacing } from "../../utils/theme";
import { SectionState } from "../SectionState";

interface ConversationHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  conversations: AssistantConversationSummary[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  activeId: number | null;
  onOpen: (conversation: AssistantConversationSummary) => void;
  onDelete: (conversation: AssistantConversationSummary) => void;
}

/** "Today, 14:05" / "Sep 27" — when the conversation was last active. */
function lastActive(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? translate("assistant.history.today", { time: formatClockTime(isoTimestamp) })
    : date.toLocaleDateString(currentLocale(), { month: "short", day: "numeric" });
}

export function ConversationHistoryModal({
  visible,
  onClose,
  conversations,
  isLoading,
  error,
  onRetry,
  hasMore,
  isLoadingMore,
  onLoadMore,
  activeId,
  onOpen,
  onDelete,
}: ConversationHistoryModalProps) {
  const { t } = useTranslation();

  function confirmDelete(conversation: AssistantConversationSummary) {
    Alert.alert(t("assistant.history.deleteTitle"), t("assistant.history.deleteMessage", { title: conversation.title }), [
      { text: t("common.actions.cancel"), style: "cancel" },
      { text: t("common.actions.delete"), style: "destructive", onPress: () => onDelete(conversation) },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t("assistant.history.title")}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.close}>
            <Text style={styles.closeText}>{t("common.actions.done")}</Text>
          </Pressable>
        </View>

        <SectionState isLoading={isLoading} error={error} onRetry={onRetry}>
          <FlatList
            data={conversations}
            keyExtractor={(conversation) => String(conversation.id)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{t("assistant.history.empty")}</Text>}
            onEndReached={hasMore ? onLoadMore : undefined}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary} /> : null}
            renderItem={({ item }) => (
              <View style={[styles.item, item.id === activeId && styles.itemActive]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("assistant.history.open", { title: item.title })}
                  accessibilityState={{ selected: item.id === activeId }}
                  onPress={() => onOpen(item)}
                  style={styles.itemBody}
                >
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.itemDate}>{lastActive(item.updated_at)}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("assistant.history.delete", { title: item.title })}
                  onPress={() => confirmDelete(item)}
                  hitSlop={8}
                  style={styles.delete}
                >
                  <Text style={styles.deleteText}>{t("common.actions.delete")}</Text>
                </Pressable>
              </View>
            )}
          />
        </SectionState>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
  },
  close: {
    minHeight: 44,
    justifyContent: "center",
  },
  closeText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primary,
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  empty: {
    paddingVertical: spacing.lg,
    textAlign: "center",
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  itemActive: {
    borderColor: colors.primary,
  },
  itemBody: {
    flex: 1,
    padding: spacing.md,
    gap: 2,
  },
  itemTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
  },
  itemDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  delete: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  deleteText: {
    fontSize: fontSize.sm,
    color: colors.danger,
    fontWeight: "600",
  },
});
