import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePaginatedTransactions } from "../hooks/usePaginatedTransactions";
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
import { colors, fontSize, spacing } from "../utils/theme";

export function TransactionsScreen() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
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

  async function handleRefresh() {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }

  // Refetch whenever this tab regains focus (e.g. returning from Add/Edit or
  // a deletion on the details screen) — skip the very first mount.
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

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
                <Text style={styles.retryText}>Retry</Text>
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
                <Text style={styles.empty}>No transactions match your filters.</Text>
              }
              onEndReached={loadMore}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                isLoadingMore ? (
                  <View style={styles.footerLoading}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : !hasMore && transactions.length > 0 ? (
                  <Text style={styles.endOfList}>That's every transaction.</Text>
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

      <Fab accessibilityLabel="Add transaction" onPress={() => router.push("/add-transaction")} />
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
