import { useCallback, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRefetchOnDataChange } from "../hooks/useOffline";
import { listBudgets } from "../services/budgetsService";
import { listCategories } from "../services/categoriesService";
import { makeStyles, radius, space, useTheme } from "../theme";
import type { Category } from "../types/category";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import { MonthSelector } from "../components/MonthSelector";
import { BudgetRow } from "../components/budgets/BudgetRow";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { Skeleton } from "../components/ui/Skeleton";
import { Text } from "../components/ui/Text";
import { MONTHS_PER_YEAR } from "../config/calendar";

const useStyles = makeStyles(({ colors }) => ({
  section: { marginTop: space[5], gap: space[3] },
  rows: { gap: 0 },
  divider: { height: 1, marginVertical: space[4], backgroundColor: colors.divider },
}));

export function BudgetsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
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
    void budgets.refetch();
    void categories.refetch();
  });

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    categories.data?.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories.data]);

  const budgetsForMonth = useMemo(
    () => (budgets.data ?? []).filter((budget) => budget.year === year && budget.month === month).sort((a, b) => b.usage_percentage - a.usage_percentage),
    [budgets.data, year, month]
  );
  // The budget for everything gets the top spot; the category budgets follow, fullest first.
  const overall = budgetsForMonth.find((budget) => budget.category === null);
  const byCategory = budgetsForMonth.filter((budget) => budget.category !== null);

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([budgets.refetch(), categories.refetch()]);
    setIsRefreshing(false);
  }

  function goToPreviousMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(MONTHS_PER_YEAR);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (month === MONTHS_PER_YEAR) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surfaceRaised} />}
    >
      <ScreenHeader title={t("tabs.budgets")} />
      <MonthSelector year={year} month={month} onPrevious={goToPreviousMonth} onNext={goToNextMonth} />

      <SectionState
        isLoading={budgets.isLoading || categories.isLoading}
        error={budgets.error ?? categories.error}
        onRetry={() => {
          void budgets.refetch();
          void categories.refetch();
        }}
        skeleton={<Skeleton height={240} radius={radius.lg} />}
      >
        {budgetsForMonth.length === 0 ? (
          <Card padding={4}>
            <EmptyState icon="budgets" title={t("budgets.empty")} />
          </Card>
        ) : (
          <>
            {overall ? (
              <Card tone="wash" padding={5}>
                <BudgetRow
                  name={t("budgets.overall")}
                  spent={overall.spent_amount}
                  budget={overall.amount}
                  remaining={overall.remaining_amount}
                  usagePercentage={overall.usage_percentage}
                />
              </Card>
            ) : null}

            {byCategory.length > 0 ? (
              <View style={styles.section}>
                <Text variant="heading" header>
                  {t("budgets.byCategory")}
                </Text>
                <Card padding={4}>
                  {byCategory.map((budget, index) => (
                    <View key={budget.id}>
                      {index > 0 ? <View style={styles.divider} /> : null}
                      <BudgetRow
                        name={(budget.category !== null && categoriesById.get(budget.category)?.name) || t("common.uncategorized")}
                        category={budget.category !== null ? categoriesById.get(budget.category) : undefined}
                        spent={budget.spent_amount}
                        budget={budget.amount}
                        remaining={budget.remaining_amount}
                        usagePercentage={budget.usage_percentage}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </SectionState>
    </Screen>
  );
}
