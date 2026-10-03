import { Alert, FlatList, Modal, Pressable, View, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { t as translate } from "i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AssistantConversationSummary } from "../../types/assistant";
import { currentLocale } from "../../i18n";
import { formatClockTime } from "../../utils/format";
import { layout, makeStyles, radius, space, useTheme } from "../../theme";
import { SectionState } from "../SectionState";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";
import { Text } from "../ui/Text";

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

const useStyles = makeStyles(({ colors }) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: layout.screenPadding, paddingRight: space[2], minHeight: 56 },
  list: { padding: layout.screenPadding, paddingTop: space[2], gap: space[3] },
  item: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  itemActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  itemBody: { flex: 1, gap: 2, padding: space[4] },
}));

/** The list of past conversations, as a page sheet: open one to continue it, delete one on every device. */
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
  const styles = useStyles();
  const { colors } = useTheme();

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
          <Text variant="heading" header>
            {t("assistant.history.title")}
          </Text>
          <IconButton icon="x" accessibilityLabel={t("common.actions.close")} onPress={onClose} iconColor="textSecondary" />
        </View>

        <View style={{ flex: 1 }}>
          <SectionState isLoading={isLoading} error={error} onRetry={onRetry}>
            <FlatList
              data={conversations}
              keyExtractor={(conversation) => String(conversation.id)}
              contentContainerStyle={styles.list}
              ListEmptyComponent={<EmptyState icon="assistant" title={t("assistant.history.empty")} />}
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
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {lastActive(item.updated_at)}
                    </Text>
                  </Pressable>
                  <IconButton icon="trash" iconColor="danger" accessibilityLabel={t("assistant.history.delete", { title: item.title })} onPress={() => confirmDelete(item)} />
                </View>
              )}
            />
          </SectionState>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
