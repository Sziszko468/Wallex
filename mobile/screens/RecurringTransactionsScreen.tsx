import { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { listCategories } from "../services/categoriesService";
import {
  deleteRecurringTransaction,
  listRecurringTransactions,
  updateRecurringTransaction,
} from "../services/recurringTransactionsService";
import { makeStyles, space, useTheme } from "../theme";
import type { Category } from "../types/category";
import type { RecurringTransaction } from "../types/recurringTransaction";
import { extractErrorMessage } from "../utils/errors";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import { RecurringRow } from "../components/recurring/RecurringRow";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonRows } from "../components/ui/Skeleton";
import { Text } from "../components/ui/Text";

const useStyles = makeStyles(({ colors }) => ({
  divider: { height: 1, marginLeft: space[4] + 40 + space[3], backgroundColor: colors.divider },
  sheetActions: { gap: space[3], paddingBottom: space[2] },
}));

export function RecurringTransactionsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const items = useAsyncData(useCallback(() => listRecurringTransactions(), []));
  const categories = useAsyncData(useCallback(() => listCategories(), []));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<RecurringTransaction | null>(null);

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    categories.data?.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories.data]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([items.refetch(), categories.refetch()]);
    setIsRefreshing(false);
  }

  // Back from Add/Edit: show the change.
  useRefetchOnFocus(items.refetch);

  function handleEdit(item: RecurringTransaction) {
    setSelected(null);
    router.push(`/edit-recurring/${item.id}`);
  }

  function handleDeletePress(item: RecurringTransaction) {
    setSelected(null);
    Alert.alert(t("recurring.deleteTitle"), t("common.confirm.deleteMessage", { name: item.name }), [
      { text: t("common.actions.cancel"), style: "cancel" },
      { text: t("common.actions.delete"), style: "destructive", onPress: () => void confirmDelete(item) },
    ]);
  }

  async function confirmDelete(item: RecurringTransaction) {
    try {
      await deleteRecurringTransaction(item.id);
      void items.refetch();
    } catch (error) {
      Alert.alert(t("recurring.couldntDelete"), extractErrorMessage(error));
    }
  }

  async function handleToggleActive(item: RecurringTransaction) {
    setSelected(null);
    setTogglingId(item.id);
    try {
      await updateRecurringTransaction(item.id, { is_active: !item.is_active });
      void items.refetch();
    } catch (error) {
      Alert.alert(t("recurring.couldntUpdate"), extractErrorMessage(error));
    } finally {
      setTogglingId(null);
    }
  }

  const list = items.data ?? [];

  return (
    <Screen
      scroll
      contentStyle={{ paddingTop: space[3] }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surfaceRaised} />}
      footer={<Button title={t("recurring.add")} icon="plus" onPress={() => router.push("/add-recurring")} />}
    >
      <SectionState
        isLoading={items.isLoading || categories.isLoading}
        error={items.error ?? categories.error}
        onRetry={() => {
          void items.refetch();
          void categories.refetch();
        }}
        skeleton={
          <Card padding={0}>
            <SkeletonRows count={4} />
          </Card>
        }
      >
        {list.length === 0 ? (
          <Card padding={4}>
            <EmptyState icon="recurring" title={t("recurring.emptyTitle")} message={t("recurring.empty")} />
          </Card>
        ) : (
          <Card padding={0}>
            {list.map((item, index) => (
              <View key={item.id} style={togglingId === item.id ? { opacity: 0.5 } : undefined}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <RecurringRow item={item} category={categoriesById.get(item.category)} onPress={() => setSelected(item)} />
              </View>
            ))}
          </Card>
        )}
      </SectionState>

      <BottomSheet visible={selected !== null} onClose={() => setSelected(null)} title={selected?.name}>
        {selected ? (
          <View style={styles.sheetActions}>
            <Text variant="caption" color="textSecondary">
              {categoriesById.get(selected.category)?.name ?? t("common.uncategorized")}
            </Text>
            <Button
              title={selected.is_active ? t("common.actions.pause") : t("common.actions.resume")}
              accessibilityLabel={t(selected.is_active ? "recurring.pauseLabel" : "recurring.resumeLabel", { name: selected.name })}
              variant="secondary"
              icon={selected.is_active ? "pause" : "play"}
              onPress={() => void handleToggleActive(selected)}
            />
            <Button title={t("common.actions.edit")} accessibilityLabel={t("recurring.editLabel", { name: selected.name })} variant="secondary" icon="pencil" onPress={() => handleEdit(selected)} />
            <Button title={t("common.actions.delete")} accessibilityLabel={t("recurring.deleteLabel", { name: selected.name })} variant="dangerSoft" icon="trash" onPress={() => handleDeletePress(selected)} />
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
