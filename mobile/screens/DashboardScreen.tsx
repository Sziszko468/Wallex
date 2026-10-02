import { useCallback, useMemo, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRefetchOnDataChange } from "../hooks/useOffline";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { Screen } from "../components/Screen";
import { Fab } from "../components/Fab";
import { SectionState } from "../components/SectionState";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { MonthSelector } from "../components/MonthSelector";
import { SummaryCard } from "../components/dashboard/SummaryCard";
import { SpendingTrendChart } from "../components/dashboard/SpendingTrendChart";
import { TopCategories } from "../components/dashboard/TopCategories";
import { RecentTransactions } from "../components/dashboard/RecentTransactions";
import { BudgetStatus } from "../components/dashboard/BudgetStatus";
import { Insights } from "../components/dashboard/Insights";
import {
  getCategoryAnalytics,
  getDashboard,
  getInsights,
  getMonthlyAnalytics,
} from "../services/analyticsService";
import { listCategories } from "../services/categoriesService";
import { listTransactions } from "../services/transactionsService";
import { colors, fontSize, spacing } from "../utils/theme";
import { MONTHS_PER_YEAR } from "../config/calendar";

const RECENT_TRANSACTIONS_COUNT = 5;

export function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dashboard = useAsyncData(useCallback(() => getDashboard({ year, month }), [year, month]));
  const monthly = useAsyncData(useCallback(() => getMonthlyAnalytics({ year }), [year]));
  const categoryBreakdown = useAsyncData(
    useCallback(() => getCategoryAnalytics({ year, month }), [year, month])
  );
  const insights = useAsyncData(useCallback(() => getInsights({ year, month }), [year, month]));
  const recentTransactions = useAsyncData(
    useCallback(
      () => listTransactions({ ordering: "-date", page_size: RECENT_TRANSACTIONS_COUNT }),
      []
    )
  );
  // Independent of year/month on purpose — "recent" means the latest activity
  // overall, not a report scoped to whichever month is currently selected.
  const categories = useAsyncData(useCallback(() => listCategories(), []));

  const colorByCategoryId = useMemo(() => {
    const map = new Map<number, string>();
    categories.data?.forEach((category) => map.set(category.id, category.color));
    return map;
  }, [categories.data]);

  const nameByCategoryId = useMemo(() => {
    const map = new Map<number, string>();
    categories.data?.forEach((category) => map.set(category.id, category.name));
    return map;
  }, [categories.data]);

  // Pending transactions were synced, or the connection came back: reload from the backend.
  useRefetchOnDataChange(() => {
    dashboard.refetch();
    monthly.refetch();
    categoryBreakdown.refetch();
    insights.refetch();
    recentTransactions.refetch();
    categories.refetch();
  });

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([
      dashboard.refetch(),
      monthly.refetch(),
      categoryBreakdown.refetch(),
      insights.refetch(),
      recentTransactions.refetch(),
      categories.refetch(),
    ]);
    setIsRefreshing(false);
  }

  // Picks up a transaction added through the Quick Add modal once it's dismissed.
  useRefetchOnFocus(() => {
    dashboard.refetch();
    monthly.refetch();
    categoryBreakdown.refetch();
    insights.refetch();
    recentTransactions.refetch();
  });

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

  const displayName = user?.first_name || user?.email;

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
        <Text style={styles.greeting}>
          {displayName ? t("dashboard.greetingWithName", { name: displayName }) : t("dashboard.greeting")}
        </Text>

        <MonthSelector year={year} month={month} onPrevious={goToPreviousMonth} onNext={goToNextMonth} />

        <DashboardCard title={t("dashboard.cards.overview")}>
          <SectionState isLoading={dashboard.isLoading} error={dashboard.error} onRetry={dashboard.refetch}>
            {dashboard.data && <SummaryCard stats={dashboard.data} />}
          </SectionState>
        </DashboardCard>

        <DashboardCard title={t("dashboard.cards.insights")}>
          <SectionState isLoading={insights.isLoading} error={insights.error} onRetry={insights.refetch}>
            {insights.data && <Insights insights={insights.data.insights} />}
          </SectionState>
        </DashboardCard>

        <DashboardCard title={t("dashboard.cards.monthly")}>
          <SectionState isLoading={monthly.isLoading} error={monthly.error} onRetry={monthly.refetch}>
            {monthly.data && <SpendingTrendChart months={monthly.data.months} selectedMonth={month} />}
          </SectionState>
        </DashboardCard>

        <DashboardCard title={t("dashboard.cards.topCategories")}>
          <SectionState
            isLoading={categoryBreakdown.isLoading || categories.isLoading}
            error={categoryBreakdown.error ?? categories.error}
            onRetry={() => {
              categoryBreakdown.refetch();
              categories.refetch();
            }}
          >
            {categoryBreakdown.data && (
              <TopCategories
                categories={categoryBreakdown.data.categories}
                colorByCategoryId={colorByCategoryId}
              />
            )}
          </SectionState>
        </DashboardCard>

        <DashboardCard title={t("dashboard.cards.recent")}>
          <SectionState
            isLoading={recentTransactions.isLoading || categories.isLoading}
            error={recentTransactions.error ?? categories.error}
            onRetry={() => {
              recentTransactions.refetch();
              categories.refetch();
            }}
          >
            {recentTransactions.data && (
              <RecentTransactions
                transactions={recentTransactions.data.results}
                colorByCategoryId={colorByCategoryId}
                nameByCategoryId={nameByCategoryId}
              />
            )}
          </SectionState>
        </DashboardCard>

        <DashboardCard title={t("dashboard.cards.budgetStatus")}>
          <SectionState isLoading={dashboard.isLoading} error={dashboard.error} onRetry={dashboard.refetch}>
            {dashboard.data && <BudgetStatus budgets={dashboard.data.budget_usage} />}
          </SectionState>
        </DashboardCard>
      </Screen>

      <Fab accessibilityLabel={t("dashboard.addTransaction")} onPress={() => router.push("/add-transaction")} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  greeting: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
});
