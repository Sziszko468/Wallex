import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SEARCH_DEBOUNCE_MS } from "../config/transactions";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePaginatedTransactions } from "../hooks/usePaginatedTransactions";
import { useOffline, useRefetchOnDataChange } from "../hooks/useOffline";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { listCategories } from "../services/categoriesService";
import type { Category } from "../types/category";
import { getMonthRange } from "../utils/date";
import { extractErrorMessage } from "../utils/errors";
import { Screen } from "../components/Screen";
import { ErrorBanner } from "../components/ErrorBanner";
import { Fab } from "../components/Fab";
import { SearchBar } from "../components/transactions/SearchBar";
import { CategoryFilterChips } from "../components/transactions/CategoryFilterChips";
import { DateRangeFilterChips, type DatePreset } from "../components/transactions/DateRangeFilterChips";
import { TransactionListItem } from "../components/transactions/TransactionListItem";
import { PendingTransactionsList } from "../components/transactions/PendingTransactionsList";
import { colors, fontSize, spacing } from "../utils/theme";

export function TransactionsScreen() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dateRange = useMemo(() => {
    if (datePreset === "thisMonth") return getMonthRange(0);
    if (datePreset === "lastMonth") return getMonthRange(1);
    return { dateFrom: undefined, dateTo: undefined };
  }, [datePreset]);

  const { transactions, isLoading, isLoadingMore, error, hasMore, loadMore, refetch } = usePaginatedTransactions({
    search: debouncedSearch,
    category: categoryId ?? undefined,
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
  });

  const categories = useAsyncData(useCallback(() => listCategories(), []));
  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    categories.data?.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories.data]);

  const { pendingTransactions, retry, discard, syncNow } = useOffline();
  useRefetchOnDataChange(() => {
    void refetch();
    void categories.refetch();
  });

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([refetch(), syncNow()]);
    setIsRefreshing(false);
  }

  // Back from Add/Edit or a deletion on the details screen: reload with the current filters.
  useRefetchOnFocus(refetch);

  return (
    <View style={styles.flex}>
      <Screen>
        <View style={styles.filters}>
          <SearchBar value={search} onChangeText={setSearch} />
          <CategoryFilterChips
            categories={categories.data ?? []}
            selectedId={categoryId}
            onSelect={setCategoryId}
          />
          <DateRangeFilterChips value={datePreset} onChange={setDatePreset} />
        </View>

        <PendingTransactionsList
          items={pendingTransactions}
          categoriesById={categoriesById}
          onRetry={(clientId) => void retry(clientId)}
          onDiscard={(clientId) => void discard(clientId)}
        />

        <View style={styles.listArea}>
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <View>
              <ErrorBanner message={extractErrorMessage(error)} />
              <Pressable
                accessibilityRole="button"
                onPress={refetch}
                hitSlop={8}
                style={styles.retry}
              >
                <Text style={styles.retryText}>{t("common.actions.retry")}</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={(transaction) => String(transaction.id)}
              renderItem={({ item }) => (
                <TransactionListItem
                  transaction={item}
                  category={categoriesById.get(item.category)}
                  onPress={() => router.push(`/transaction/${item.id}`)}
                />
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>{t("transactions.empty")}</Text>
              }
              onEndReached={loadMore}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                isLoadingMore ? (
                  <View style={styles.footerLoading}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : !hasMore && transactions.length > 0 ? (
                  <Text style={styles.endOfList}>{t("transactions.endOfList")}</Text>
                ) : null
              }
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
              contentContainerStyle={
                transactions.length === 0 ? styles.emptyContent : undefined
              }
            />
          )}
        </View>
      </Screen>

      <Fab accessibilityLabel={t("screens.addTransaction")} onPress={() => router.push("/add-transaction")} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  filters: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  listArea: {
    flex: 1,
  },
  center: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  retry: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  footerLoading: {
    paddingVertical: spacing.md,
  },
  endOfList: {
    textAlign: "center",
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.md,
  },
});
