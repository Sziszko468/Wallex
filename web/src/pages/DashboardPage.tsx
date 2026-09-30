import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  getCategoryAnalytics,
  getComparison,
  getDashboard,
  getInsights,
  getMerchants,
  getMonthlyAnalytics,
  getSpendingPatterns,
  getTrends,
} from "../services/analyticsService";
import { listCategories } from "../services/categoriesService";
import { getSavingsSummary, listSavingsGoals } from "../services/savingsGoalsService";
import { listAchievements } from "../services/achievementsService";
import { listTransactions } from "../services/transactionsService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useAuth } from "../hooks/useAuth";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { usePageTitle } from "../hooks/usePageTitle";
import type { Category } from "../types/category";
import type { ComparisonAgainst } from "../types/dashboard";
import { FALLBACK_CATEGORY_COLOR } from "../utils/categoryStyle";
import { greetingFor } from "../utils/greeting";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { DashboardHero } from "../components/dashboard/DashboardHero";
import { MonthNavigator } from "../components/MonthNavigator";
import { MonthlySpendingChart } from "../components/dashboard/MonthlySpendingChart";
import { CategoryDonutChart } from "../components/dashboard/CategoryDonutChart";
import { BudgetOverview } from "../components/dashboard/BudgetOverview";
import { TopCategoriesList } from "../components/dashboard/TopCategoriesList";
import { RecentTransactionsList } from "../components/dashboard/RecentTransactionsList";
import { InsightsList } from "../components/dashboard/InsightsList";
import { SpendingTrend } from "../components/dashboard/SpendingTrend";
import { CategoryTrendsTable } from "../components/dashboard/CategoryTrendsTable";
import { MonthComparison } from "../components/dashboard/MonthComparison";
import { TopMerchantsList } from "../components/dashboard/TopMerchantsList";
import { SpendingPatternsCard } from "../components/dashboard/SpendingPatternsCard";
import { SubscriptionsOverview } from "../components/dashboard/SubscriptionsOverview";
import { SavingsProgress } from "../components/dashboard/SavingsProgress";
import { AchievementsOverview } from "../components/dashboard/AchievementsOverview";
import { Disclosure } from "../components/Disclosure";
import { PageHeader } from "../components/PageHeader";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import pageStyles from "../components/page.module.scss";
import styles from "./DashboardPage.module.scss";

const RECENT_TRANSACTIONS_LIMIT = 8;
const TREND_MONTHS = 6;
const TOP_MERCHANTS_LIMIT = 5;

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function DashboardPage() {
  const { user } = useAuth();
  usePageTitle("Dashboard");
  const [{ year, month }, setPeriod] = useState(currentPeriod);
  // On a phone the deeper analysis starts folded away, so the page opens on what matters most.
  const isTabletOrWider = useMediaQuery("(min-width: 768px)", true);

  const fetchStats = useCallback(() => getDashboard({ year, month }), [year, month]);
  const stats = useAsyncData(fetchStats);

  const fetchMonthly = useCallback(() => getMonthlyAnalytics({ year }), [year]);
  const monthly = useAsyncData(fetchMonthly);

  const fetchCategoryBreakdown = useCallback(
    () => getCategoryAnalytics({ year, month }),
    [year, month]
  );
  const categoryBreakdown = useAsyncData(fetchCategoryBreakdown);

  const fetchInsights = useCallback(() => getInsights({ year, month }), [year, month]);
  const insights = useAsyncData(fetchInsights);

  // Spending analysis — every figure below is computed by the backend.
  const [against, setAgainst] = useState<ComparisonAgainst>("previous_month");
  const fetchComparison = useCallback(() => getComparison({ year, month, against }), [year, month, against]);
  const comparison = useAsyncData(fetchComparison);

  const fetchTrends = useCallback(() => getTrends({ year, month, months: TREND_MONTHS }), [year, month]);
  const trends = useAsyncData(fetchTrends);

  const fetchMerchants = useCallback(
    () => getMerchants({ year, month, limit: TOP_MERCHANTS_LIMIT }),
    [year, month]
  );
  const merchants = useAsyncData(fetchMerchants);

  const fetchPatterns = useCallback(() => getSpendingPatterns({ year, month }), [year, month]);
  const patterns = useAsyncData(fetchPatterns);

  const fetchRecentTransactions = useCallback(
    () => listTransactions({ page_size: RECENT_TRANSACTIONS_LIMIT }),
    []
  );
  const recentTransactions = useAsyncData(fetchRecentTransactions);

  const fetchCategories = useCallback(() => listCategories(), []);
  const categories = useAsyncData(fetchCategories);

  // Savings goals aren't tied to the selected month: their current state.
  const fetchSavingsSummary = useCallback(() => getSavingsSummary(), []);
  const savingsSummary = useAsyncData(fetchSavingsSummary);
  const fetchSavingsGoals = useCallback(() => listSavingsGoals(), []);
  const savingsGoals = useAsyncData(fetchSavingsGoals);

  // Evaluated by the server on read; the dashboard only shows them (the Achievements page marks them seen).
  const fetchAchievements = useCallback(() => listAchievements(), []);
  const achievements = useAsyncData(fetchAchievements);

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    for (const category of categories.data ?? []) {
      map.set(category.id, category);
    }
    return map;
  }, [categories.data]);

  const colorForCategory = useCallback(
    (categoryId: number) => categoriesById.get(categoryId)?.color ?? FALLBACK_CATEGORY_COLOR,
    [categoriesById]
  );

  const handlePeriodChange = useCallback((nextYear: number, nextMonth: number) => {
    setPeriod({ year: nextYear, month: nextMonth });
  }, []);

  const greeting = user?.first_name ? `${greetingFor()}, ${user.first_name}` : greetingFor();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={greeting}
        actions={<MonthNavigator year={year} month={month} onChange={handlePeriodChange} />}
      />

      {stats.error ? (
        <DashboardCard title="Overview">
          <ErrorState error={stats.error} onRetry={stats.refetch} />
        </DashboardCard>
      ) : (
        <DashboardHero stats={stats.data} year={year} month={month} isLoading={stats.isLoading} />
      )}

      <DashboardCard title="Insights" description="What deserves your attention this month">
        <SectionBody isLoading={insights.isLoading} error={insights.error} onRetry={insights.refetch} height={150}>
          {insights.data && <InsightsList insights={insights.data.insights} />}
        </SectionBody>
      </DashboardCard>

      <div className={styles.split}>
        <DashboardCard title="Monthly spending" description={`Income and expenses in ${year}`}>
          <SectionBody isLoading={monthly.isLoading} error={monthly.error} onRetry={monthly.refetch} height={300}>
            {monthly.data && <MonthlySpendingChart data={monthly.data.months} highlightMonth={month} />}
          </SectionBody>
        </DashboardCard>

        <DashboardCard title="Spending by category">
          <SectionBody
            isLoading={categoryBreakdown.isLoading}
            error={categoryBreakdown.error}
            onRetry={categoryBreakdown.refetch}
            height={300}
          >
            {categoryBreakdown.data && (
              <>
                <CategoryDonutChart data={categoryBreakdown.data.categories} colorFor={colorForCategory} />
                <TopCategoriesList categories={categoryBreakdown.data.categories} colorFor={colorForCategory} />
              </>
            )}
          </SectionBody>
        </DashboardCard>
      </div>

      <div className={styles.split}>
        <DashboardCard title="Budget overview" description="How this month is tracking against your limits">
          <SectionBody isLoading={stats.isLoading} error={stats.error} onRetry={stats.refetch} height={260}>
            {stats.data && <BudgetOverview budgets={stats.data.budget_usage} categoriesById={categoriesById} />}
          </SectionBody>
        </DashboardCard>

        <DashboardCard title="Recent transactions" action={<Link to="/transactions">View all</Link>}>
          <SectionBody
            isLoading={recentTransactions.isLoading || categories.isLoading}
            error={recentTransactions.error ?? categories.error}
            onRetry={recentTransactions.refetch}
            height={260}
          >
            {recentTransactions.data && (
              <RecentTransactionsList
                transactions={recentTransactions.data.results}
                categoriesById={categoriesById}
              />
            )}
          </SectionBody>
        </DashboardCard>
      </div>

      <div className={styles.plans}>
        <DashboardCard title="Savings progress">
          <SectionBody
            isLoading={savingsSummary.isLoading || savingsGoals.isLoading}
            error={savingsSummary.error ?? savingsGoals.error}
            onRetry={() => {
              savingsSummary.refetch();
              savingsGoals.refetch();
            }}
            height={220}
          >
            {savingsSummary.data && savingsGoals.data && (
              <SavingsProgress summary={savingsSummary.data} goals={savingsGoals.data} />
            )}
          </SectionBody>
        </DashboardCard>

        <DashboardCard title="Subscriptions">
          <SectionBody isLoading={stats.isLoading} error={stats.error} onRetry={stats.refetch} height={220}>
            {stats.data && <SubscriptionsOverview subscriptions={stats.data.subscriptions} />}
          </SectionBody>
        </DashboardCard>

        <DashboardCard title="Achievements">
          <SectionBody isLoading={achievements.isLoading} error={achievements.error} onRetry={achievements.refetch} height={220}>
            {achievements.data && <AchievementsOverview achievements={achievements.data} />}
          </SectionBody>
        </DashboardCard>
      </div>

      <Disclosure
        title="Spending analysis"
        description="Trends, comparisons and habits"
        defaultOpen={isTabletOrWider}
      >
        <div className={styles.split}>
          <DashboardCard title="Spending trend">
            <SectionBody isLoading={trends.isLoading} error={trends.error} onRetry={trends.refetch} height={300}>
              {trends.data && <SpendingTrend trends={trends.data} />}
            </SectionBody>
          </DashboardCard>

          <DashboardCard title="Comparison">
            <SectionBody isLoading={comparison.isLoading} error={comparison.error} onRetry={comparison.refetch} height={300}>
              {comparison.data && (
                <MonthComparison comparison={comparison.data} against={against} onAgainstChange={setAgainst} />
              )}
            </SectionBody>
          </DashboardCard>
        </div>

        <div className={styles.even}>
          <DashboardCard title="Category trends">
            <SectionBody isLoading={trends.isLoading} error={trends.error} onRetry={trends.refetch} height={240}>
              {trends.data && <CategoryTrendsTable trends={trends.data} colorFor={colorForCategory} />}
            </SectionBody>
          </DashboardCard>

          <DashboardCard title="Top merchants">
            <SectionBody isLoading={merchants.isLoading} error={merchants.error} onRetry={merchants.refetch} height={240}>
              {merchants.data && <TopMerchantsList merchants={merchants.data.merchants} />}
            </SectionBody>
          </DashboardCard>
        </div>

        <DashboardCard title="Spending patterns">
          <SectionBody isLoading={patterns.isLoading} error={patterns.error} onRetry={patterns.refetch} height={280}>
            {patterns.data && <SpendingPatternsCard patterns={patterns.data} />}
          </SectionBody>
        </DashboardCard>
      </Disclosure>
    </div>
  );
}

interface SectionBodyProps {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Roughly the height of the finished content, so the page doesn't jump when it arrives. */
  height: number;
  children: ReactNode;
}

function SectionBody({ isLoading, error, onRetry, height, children }: SectionBodyProps) {
  if (isLoading) {
    return <Skeleton height={height} borderRadius={12} />;
  }
  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  return <>{children}</>;
}
