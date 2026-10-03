import { useCallback, useMemo, useState, type ReactElement } from "react";
import { ActivityIndicator, RefreshControl, SectionList, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SEARCH_DEBOUNCE_MS, type DatePreset } from "../config/transactions";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePaginatedTransactions } from "../hooks/usePaginatedTransactions";
import { useOffline, useRefetchOnDataChange } from "../hooks/useOffline";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { listCategories } from "../services/categoriesService";
import { makeStyles, radius, space, useTheme } from "../theme";
import type { Category } from "../types/category";
import type { Transaction } from "../types/transaction";
import { getMonthRange } from "../utils/date";
import { categoryLook } from "../utils/categoryStyle";
import { groupByDay } from "../utils/transactionGroups";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import { FilterSheet, type TypeFilter } from "../components/transactions/FilterSheet";
import { PendingTransactionsList } from "../components/transactions/PendingTransactionsList";
import { SearchBar } from "../components/transactions/SearchBar";
import { TransactionListItem } from "../components/transactions/TransactionListItem";
import { Card } from "../components/ui/Card";
import { Chip } from "../components/ui/Chip";
import { EmptyState } from "../components/ui/EmptyState";
import { IconButton } from "../components/ui/IconButton";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { SkeletonRows } from "../components/ui/Skeleton";
import { Text } from "../components/ui/Text";

const useStyles = makeStyles(({ colors }) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginBottom: space[3] },
  searchRow: { marginBottom: space[3] },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: space[6] },
  dayHeading: { paddingTop: space[3], paddingBottom: space[2], backgroundColor: colors.bg },
  shell: { borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1, backgroundColor: colors.surface },
  shellFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  shellLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  divider: { height: 1, marginLeft: space[4] + 40 + space[3], backgroundColor: colors.divider },
  groupGap: { height: space[2] },
  footerLoading: { paddingVertical: space[4] },
}));

export function TransactionsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const [search, setSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [type, setType] = useState<TypeFilter>("all");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dateRange = useMemo(() => {
    if (datePreset === "thisMonth") return getMonthRange(0);
    if (datePreset === "lastMonth") return getMonthRange(1);
    return { dateFrom: undefined, dateTo: undefined };
  }, [datePreset]);

  const { transactions, isLoading, isLoadingMore, error, hasMore, loadMore, refetch } = usePaginatedTransactions({
    search: debouncedSearch,
    type: type === "all" ? undefined : type,
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

  const sections = useMemo(() => groupByDay(transactions), [transactions]);
  const activeFilterCount = (type !== "all" ? 1 : 0) + (categoryId !== null ? 1 : 0) + (datePreset !== "all" ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const isFiltered = hasActiveFilters || debouncedSearch.length > 0;
  const selectedCategory = categoryId !== null ? categoriesById.get(categoryId) : undefined;

  function clearFilters() {
    setType("all");
    setCategoryId(null);
    setDatePreset("all");
    setSearch("");
  }

  function toggleSearch() {
    if (isSearchOpen) setSearch("");
    setIsSearchOpen((open) => !open);
  }

  function renderEmpty(): ReactElement {
    return isFiltered ? (
      <EmptyState
        icon="search"
        title={t("transactions.noMatches.title")}
        message={t("transactions.noMatches.message")}
        actionLabel={t("transactions.noMatches.action")}
        actionVariant="secondary"
        onAction={clearFilters}
      />
    ) : (
      <EmptyState
        icon="transactions"
        title={t("transactions.empty.title")}
        message={t("transactions.empty.message")}
        actionLabel={t("transactions.empty.action")}
        onAction={() => router.push("/add-transaction")}
      />
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScreenHeader
        title={t("tabs.transactions")}
        trailing={
          <>
            <IconButton icon="search" accessibilityLabel={t("transactions.openSearch")} accessibilityState={{ expanded: isSearchOpen }} onPress={toggleSearch} variant={isSearchOpen ? "soft" : "plain"} />
            <IconButton icon="filter" accessibilityLabel={t("transactions.filters")} badge={activeFilterCount || undefined} onPress={() => setIsFilterOpen(true)} variant={hasActiveFilters ? "soft" : "plain"} />
          </>
        }
      />

      {isSearchOpen ? (
        <View style={styles.searchRow}>
          <SearchBar value={search} onChangeText={setSearch} autoFocus />
        </View>
      ) : null}

      {hasActiveFilters ? (
        <View style={styles.chips}>
          {type !== "all" ? (
            <Chip isSelected label={t(`common.transactionType.${type}`)} accessibilityLabel={t("transactions.removeFilter", { name: t(`common.transactionType.${type}`) })} onPress={() => setType("all")} onRemove={() => setType("all")} />
          ) : null}
          {selectedCategory ? (
            <Chip isSelected label={selectedCategory.name} dotColor={categoryLook(selectedCategory.color, scheme).tone} accessibilityLabel={t("transactions.removeFilter", { name: selectedCategory.name })} onPress={() => setCategoryId(null)} onRemove={() => setCategoryId(null)} />
          ) : null}
          {datePreset !== "all" ? (
            <Chip isSelected label={t(`transactions.presets.${datePreset}`)} accessibilityLabel={t("transactions.removeFilter", { name: t(`transactions.presets.${datePreset}`) })} onPress={() => setDatePreset("all")} onRemove={() => setDatePreset("all")} />
          ) : null}
        </View>
      ) : null}

      <SectionState
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        skeleton={
          <Card padding={0}>
            <SkeletonRows count={6} />
          </Card>
        }
      >
        <SectionList<Transaction, { date: string; title: string; data: Transaction[] }>
          style={styles.list}
          contentContainerStyle={styles.listContent}
          sections={sections}
          keyExtractor={(transaction) => String(transaction.id)}
          stickySectionHeadersEnabled
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          renderSectionHeader={({ section }) => (
            <View style={styles.dayHeading}>
              <Text variant="label" color="textSecondary" header>
                {section.title}
              </Text>
            </View>
          )}
          renderSectionFooter={() => <View style={styles.groupGap} />}
          renderItem={({ item, index, section }) => (
            <View style={[styles.shell, index === 0 && styles.shellFirst, index === section.data.length - 1 && styles.shellLast]}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <TransactionListItem
                transaction={item}
                category={categoriesById.get(item.category)}
                showDate={false}
                onPress={() => router.push(`/transaction/${item.id}`)}
              />
            </View>
          )}
          ListHeaderComponent={
            <PendingTransactionsList
              items={pendingTransactions}
              categoriesById={categoriesById}
              onRetry={(clientId) => void retry(clientId)}
              onDiscard={(clientId) => void discard(clientId)}
            />
          }
          ListEmptyComponent={renderEmpty()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : !hasMore && transactions.length > 0 ? (
              <Text variant="caption" color="textTertiary" align="center" style={styles.footerLoading}>
                {t("transactions.endOfList")}
              </Text>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surfaceRaised} />
          }
        />
      </SectionState>

      <FilterSheet
        visible={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        categories={categories.data ?? []}
        type={type}
        onTypeChange={setType}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />
    </Screen>
  );
}
