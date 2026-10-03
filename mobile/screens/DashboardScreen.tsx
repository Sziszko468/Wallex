import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRefetchOnDataChange } from "../hooks/useOffline";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import { MonthSelector } from "../components/MonthSelector";
import { BalanceCard } from "../components/dashboard/BalanceCard";
import { Insights } from "../components/dashboard/Insights";
import { RecentTransactions } from "../components/dashboard/RecentTransactions";
import { SpendingSnapshot } from "../components/dashboard/SpendingSnapshot";
import { BudgetRow } from "../components/budgets/BudgetRow";
import { Avatar } from "../components/ui/Avatar";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { IconButton } from "../components/ui/IconButton";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Skeleton, SkeletonRows } from "../components/ui/Skeleton";
import { Text } from "../components/ui/Text";
import { getCategoryAnalytics, getDashboard, getInsights } from "../services/analyticsService";
import { listCategories } from "../services/categoriesService";
import { listTransactions } from "../services/transactionsService";
import { makeStyles, radius, space, useTheme } from "../theme";
import type { Category } from "../types/category";
import { greetingFor } from "../utils/greeting";
import { MONTHS_PER_YEAR } from "../config/calendar";

const RECENT_TRANSACTIONS_COUNT = 5;
/** The home screen shows the budgets closest to their limit; the budgets tab lists them all. */
const BUDGETS_SHOWN = 3;

const useStyles = makeStyles(() => ({
  header: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 64, paddingTop: space[3], paddingBottom: space[3] },
  greeting: { flex: 1, gap: 1 },
  section: { marginTop: space[4] },
  budgets: { gap: space[5] },
}));

export function DashboardScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dashboard = useAsyncData(useCallback(() => getDashboard({ year, month }), [year, month]));
  const categoryBreakdown = useAsyncData(useCallback(() => getCategoryAnalytics({ year, month }), [year, month]));
  const insights = useAsyncData(useCallback(() => getInsights({ year, month }), [year, month]));
  // Independent of year/month on purpose — "recent" means the latest activity overall, not a
  // report scoped to whichever month is currently selected.
  const recentTransactions = useAsyncData(
    useCallback(() => listTransactions({ ordering: "-date", page_size: RECENT_TRANSACTIONS_COUNT }), [])
  );
  const categories = useAsyncData(useCallback(() => listCategories(), []));

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    categories.data?.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories.data]);

  const budgetsByUsage = useMemo(
    () => [...(dashboard.data?.budget_usage ?? [])].sort((a, b) => b.usage_percentage - a.usage_percentage).slice(0, BUDGETS_SHOWN),
    [dashboard.data]
  );

  const reloadAll = useCallback(
    () => Promise.all([dashboard.refetch(), categoryBreakdown.refetch(), insights.refetch(), recentTransactions.refetch(), categories.refetch()]),
    [dashboard, categoryBreakdown, insights, recentTransactions, categories]
  );

  // Pending transactions were synced, or the connection came back: reload from the backend.
  useRefetchOnDataChange(() => void reloadAll());

  async function handleRefresh() {
    setIsRefreshing(true);
    await reloadAll();
    setIsRefreshing(false);
  }

  // Picks up a transaction added through the add form once it's dismissed.
  useRefetchOnFocus(() => {
    void dashboard.refetch();
    void categoryBreakdown.refetch();
    void insights.refetch();
    void recentTransactions.refetch();
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
  // Nothing recorded yet, anywhere: the screen explains what to do instead of showing empty boxes.
  const isFirstRun = recentTransactions.data !== null && recentTransactions.data.count === 0;

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surfaceRaised} />
      }
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("dashboard.account")} hitSlop={4} onPress={() => router.push("/settings")}>
          <Avatar firstName={user?.first_name} lastName={user?.last_name} email={user?.email} size={44} />
        </Pressable>
        <View style={styles.greeting}>
          <Text variant="caption" color="textSecondary">
            {greetingFor()}
          </Text>
          <Text variant="heading" numberOfLines={1} header>
            {displayName}
          </Text>
        </View>
        <IconButton icon="assistant" variant="soft" accessibilityLabel={t("dashboard.askAssistant")} onPress={() => router.push("/assistant")} />
      </View>

      <MonthSelector year={year} month={month} onPrevious={goToPreviousMonth} onNext={goToNextMonth} />

      <SectionState
        isLoading={dashboard.isLoading}
        error={dashboard.error}
        onRetry={dashboard.refetch}
        skeleton={<Skeleton height={206} radius={radius.lg} />}
      >
        {dashboard.data ? <BalanceCard stats={dashboard.data} /> : null}
      </SectionState>

      {isFirstRun ? (
        <View style={styles.section}>
          <Card padding={4}>
            <EmptyState
              icon="transactions"
              title={t("dashboard.firstRun.title")}
              message={t("dashboard.firstRun.message")}
              actionLabel={t("dashboard.firstRun.action")}
              onAction={() => router.push("/add-transaction")}
            />
          </Card>
        </View>
      ) : null}

      {insights.data && insights.data.insights.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title={t("dashboard.insights.title")} />
          <Insights insights={insights.data.insights} />
        </View>
      ) : null}

      {isFirstRun ? null : (
        <View style={styles.section}>
          <SectionHeader title={t("dashboard.spending.title")} actionLabel={t("dashboard.spending.seeAnalytics")} onAction={() => router.push("/analytics")} />
          <SectionState
            isLoading={categoryBreakdown.isLoading || categories.isLoading}
            error={categoryBreakdown.error ?? categories.error}
            onRetry={() => {
              void categoryBreakdown.refetch();
              void categories.refetch();
            }}
            skeleton={<Skeleton height={132} radius={radius.lg} />}
          >
            {categoryBreakdown.data ? <SpendingSnapshot categories={categoryBreakdown.data.categories} categoriesById={categoriesById} /> : null}
          </SectionState>
        </View>
      )}

      {dashboard.data && budgetsByUsage.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title={t("dashboard.budgets.title")} actionLabel={t("dashboard.budgets.viewAll")} onAction={() => router.push("/budgets")} />
          <Card padding={4}>
            <View style={styles.budgets}>
              {budgetsByUsage.map((budget) => (
                <BudgetRow
                  key={budget.budget_id}
                  compact
                  name={budget.category_name || t("budgets.overall")}
                  category={budget.category_id !== null ? categoriesById.get(budget.category_id) : undefined}
                  spent={budget.spent_amount}
                  budget={budget.budget_amount}
                  remaining={budget.remaining_amount}
                  usagePercentage={budget.usage_percentage}
                />
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      {isFirstRun ? null : (
        <View style={styles.section}>
          <SectionHeader title={t("dashboard.recent.title")} actionLabel={t("dashboard.recent.viewAll")} onAction={() => router.push("/transactions")} />
          <SectionState
            isLoading={recentTransactions.isLoading || categories.isLoading}
            error={recentTransactions.error ?? categories.error}
            onRetry={() => {
              void recentTransactions.refetch();
              void categories.refetch();
            }}
            skeleton={
              <Card padding={0}>
                <SkeletonRows count={3} />
              </Card>
            }
          >
            {recentTransactions.data ? (
              <RecentTransactions
                transactions={recentTransactions.data.results}
                categoriesById={categoriesById}
                onOpen={(transactionId) => router.push(`/transaction/${transactionId}`)}
              />
            ) : null}
          </SectionState>
        </View>
      )}
    </Screen>
  );
}
