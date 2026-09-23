import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAsyncData } from "../hooks/useAsyncData";
import { listCategories } from "../services/categoriesService";
import {
  deleteRecurringTransaction,
  listRecurringTransactions,
  updateRecurringTransaction,
} from "../services/recurringTransactionsService";
import type { Category } from "../types/category";
import type { RecurringTransaction } from "../types/recurringTransaction";
import { extractErrorMessage } from "../utils/errors";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import { Fab } from "../components/Fab";
import { RecurringTransactionCard } from "../components/recurring/RecurringTransactionCard";
import { colors, fontSize, spacing } from "../utils/theme";

export function RecurringTransactionsScreen() {
  const items = useAsyncData(useCallback(() => listRecurringTransactions(), []));
  const categories = useAsyncData(useCallback(() => listCategories(), []));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

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

  // Refetch whenever this tab regains focus (e.g. returning from Add/Edit) —
  // skip the very first mount, which already fetched via useAsyncData itself.
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      items.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  function handleEdit(item: RecurringTransaction) {
    router.push(`/edit-recurring/${item.id}`);
  }

  function handleDeletePress(item: RecurringTransaction) {
    Alert.alert("Delete recurring transaction", `Delete "${item.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => confirmDelete(item) },
    ]);
  }

  async function confirmDelete(item: RecurringTransaction) {
    try {
      await deleteRecurringTransaction(item.id);
      items.refetch();
    } catch (error) {
      Alert.alert("Couldn't delete", extractErrorMessage(error));
    }
  }

  async function handleToggleActive(item: RecurringTransaction) {
    setTogglingId(item.id);
    try {
      await updateRecurringTransaction(item.id, { is_active: !item.is_active });
      items.refetch();
    } catch (error) {
      Alert.alert("Couldn't update", extractErrorMessage(error));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Screen
        scroll
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <SectionState
          isLoading={items.isLoading || categories.isLoading}
          error={items.error ?? categories.error}
          onRetry={() => {
            items.refetch();
            categories.refetch();
          }}
        >
          {(items.data?.length ?? 0) === 0 ? (
            <Text style={styles.empty}>
              No recurring transactions yet. Tap + to add rent, subscriptions, or bills.
            </Text>
          ) : (
            items.data?.map((item) => (
              <RecurringTransactionCard
                key={item.id}
                item={item}
                category={categoriesById.get(item.category)}
                onEdit={() => handleEdit(item)}
                onDelete={() => handleDeletePress(item)}
                onToggleActive={() => handleToggleActive(item)}
                isToggling={togglingId === item.id}
              />
            ))
          )}
        </SectionState>
      </Screen>

      <Fab
        accessibilityLabel="Add recurring transaction"
        onPress={() => router.push("/add-recurring")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
});
