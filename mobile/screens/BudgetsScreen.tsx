import { useCallback, useMemo, useState } from "react";
import { RefreshControl, StyleSheet, Text } from "react-native";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRefetchOnDataChange } from "../hooks/useOffline";
import { listBudgets } from "../services/budgetsService";
import { listCategories } from "../services/categoriesService";
import type { Category } from "../types/category";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import { MonthSelector } from "../components/MonthSelector";
import { BudgetCard } from "../components/budgets/BudgetCard";
import { colors, fontSize, spacing } from "../utils/theme";

export function BudgetsScreen() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Not paginated or filterable server-side — fetch once, filter by the
  // selected month on the client (pure row selection, no recalculation).
  const budgets = useAsyncData(useCallback(() => listBudgets(), []));
  const categories = useAsyncData(useCallback(() => listCategories(), []));
  // Synced offline expenses change "spent" — reload it from the backend.
  useRefetchOnDataChange(() => {
    budgets.refetch();
    categories.refetch();
  });

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    categories.data?.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories.data]);

  const budgetsForMonth = useMemo(
    () =>
      (budgets.data ?? [])
        .filter((budget) => budget.year === year && budget.month === month)
        .sort((a, b) => b.usage_percentage - a.usage_percentage),
    [budgets.data, year, month]
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([budgets.refetch(), categories.refetch()]);
    setIsRefreshing(false);
  }

  function goToPreviousMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
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
      <MonthSelector year={year} month={month} onPrevious={goToPreviousMonth} onNext={goToNextMonth} />

      <SectionState
        isLoading={budgets.isLoading || categories.isLoading}
        error={budgets.error ?? categories.error}
        onRetry={() => {
          budgets.refetch();
          categories.refetch();
        }}
      >
        {budgetsForMonth.length === 0 ? (
          <Text style={styles.empty}>No budgets set for this month.</Text>
        ) : (
          budgetsForMonth.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              category={budget.category ? categoriesById.get(budget.category) : undefined}
            />
          ))
        )}
      </SectionState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
});
