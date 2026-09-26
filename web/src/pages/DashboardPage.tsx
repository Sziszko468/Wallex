import { useCallback, useMemo, useState, type ReactNode } from "react";
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
import { listTransactions } from "../services/transactionsService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useAuth } from "../hooks/useAuth";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import type { Category } from "../types/category";
import type { ComparisonAgainst } from "../types/dashboard";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { StatCard } from "../components/dashboard/StatCard";
import { MonthNavigator } from "../components/MonthNavigator";
import { MonthlySpendingChart } from "../components/dashboard/MonthlySpendingChart";
import { CategoryPieChart } from "../components/dashboard/CategoryPieChart";
import { BudgetOverview } from "../components/dashboard/BudgetOverview";
import { TopCategoriesList } from "../components/dashboard/TopCategoriesList";
import { RecentTransactionsList } from "../components/dashboard/RecentTransactionsList";
import { InsightsList } from "../components/dashboard/InsightsList";
import { SpendingTrend } from "../components/dashboard/SpendingTrend";
import { CategoryTrendsTable } from "../components/dashboard/CategoryTrendsTable";
import { MonthComparison } from "../components/dashboard/MonthComparison";
import { TopMerchantsList } from "../components/dashboard/TopMerchantsList";
import { SpendingPatternsCard } from "../components/dashboard/SpendingPatternsCard";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { formatCurrency } from "../utils/format";
import styles from "./DashboardPage.module.scss";

const RECENT_TRANSACTIONS_LIMIT = 5;
const TREND_MONTHS = 6;
const TOP_MERCHANTS_LIMIT = 5;
const FALLBACK_CATEGORY_COLOR = "#9ca3af";

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function DashboardPage() {
  const { user } = useAuth();
  const baseCurrency = useBaseCurrency();
  const [{ year, month }, setPeriod] = useState(currentPeriod);

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

  const balanceTone =
    stats.data && Number(stats.data.balance) < 0 ? ("negative" as const) : ("positive" as const);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        {user?.first_name ? `${user.first_name}'s Dashboard` : "Dashboard"}
      </h1>

      <MonthNavigator year={year} month={month} onChange={handlePeriodChange} />

      {stats.error ? (
        <DashboardCard title="Overview">
          <ErrorState error={stats.error} onRetry={stats.refetch} />
        </DashboardCard>
      ) : (
        <div className={styles.statsRow}>
          <StatCard
            label="Income"
            value={stats.data ? formatCurrency(stats.data.total_income, baseCurrency) : undefined}
            tone="positive"
            isLoading={stats.isLoading}
          />
          <StatCard
            label="Expenses"
            value={stats.data ? formatCurrency(stats.data.total_expenses, baseCurrency) : undefined}
            tone="negative"
            isLoading={stats.isLoading}
          />
          <StatCard
            label="Balance"
            value={stats.data ? formatCurrency(stats.data.balance, baseCurrency) : undefined}
            tone={balanceTone}
            isLoading={stats.isLoading}
          />
        </div>
      )}

      <DashboardCard title="Insights">
        <SectionBody isLoading={insights.isLoading} error={insights.error} onRetry={insights.refetch}>
          {insights.data && <InsightsList insights={insights.data.insights} />}
        </SectionBody>
      </DashboardCard>

      <div className={styles.chartsRow}>
        <DashboardCard title="Monthly spending" className={styles.spanTwo}>
          <SectionBody isLoading={monthly.isLoading} error={monthly.error} onRetry={monthly.refetch}>
            {monthly.data && <MonthlySpendingChart data={monthly.data.months} />}
          </SectionBody>
        </DashboardCard>

        <DashboardCard title="Spending by category">
          <SectionBody
            isLoading={categoryBreakdown.isLoading}
            error={categoryBreakdown.error}
            onRetry={categoryBreakdown.refetch}
          >
            {categoryBreakdown.data && (
              <CategoryPieChart data={categoryBreakdown.data.categories} colorFor={colorForCategory} />
            )}
          </SectionBody>
        </DashboardCard>
      </div>

      <div className={styles.listsRow}>
        <DashboardCard title="Budget overview">
          <SectionBody isLoading={stats.isLoading} error={stats.error} onRetry={stats.refetch}>
            {stats.data && <BudgetOverview budgets={stats.data.budget_usage} />}
          </SectionBody>
        </DashboardCard>

        <DashboardCard title="Top categories">
          <SectionBody
            isLoading={categoryBreakdown.isLoading}
            error={categoryBreakdown.error}
            onRetry={categoryBreakdown.refetch}
          >
            {categoryBreakdown.data && (
              <TopCategoriesList categories={categoryBreakdown.data.categories} colorFor={colorForCategory} />
            )}
          </SectionBody>
        </DashboardCard>
      </div>

      <h2 className={styles.sectionHeading}>Spending analysis</h2>

      <div className={styles.chartsRow}>
        <DashboardCard title="Spending trend">
          <SectionBody isLoading={trends.isLoading} error={trends.error} onRetry={trends.refetch}>
            {trends.data && <SpendingTrend trends={trends.data} />}
          </SectionBody>
        </DashboardCard>

        <DashboardCard title="Comparison">
          <SectionBody isLoading={comparison.isLoading} error={comparison.error} onRetry={comparison.refetch}>
            {comparison.data && (
              <MonthComparison comparison={comparison.data} against={against} onAgainstChange={setAgainst} />
            )}
          </SectionBody>
        </DashboardCard>
      </div>

      <div className={styles.listsRow}>
        <DashboardCard title="Category trends">
          <SectionBody isLoading={trends.isLoading} error={trends.error} onRetry={trends.refetch}>
            {trends.data && <CategoryTrendsTable trends={trends.data} colorFor={colorForCategory} />}
          </SectionBody>
        </DashboardCard>

        <DashboardCard title="Top merchants">
          <SectionBody isLoading={merchants.isLoading} error={merchants.error} onRetry={merchants.refetch}>
            {merchants.data && <TopMerchantsList merchants={merchants.data.merchants} />}
          </SectionBody>
        </DashboardCard>
      </div>

      <DashboardCard title="Spending patterns">
        <SectionBody isLoading={patterns.isLoading} error={patterns.error} onRetry={patterns.refetch}>
          {patterns.data && <SpendingPatternsCard patterns={patterns.data} />}
        </SectionBody>
      </DashboardCard>

      <DashboardCard title="Recent transactions">
        <SectionBody
          isLoading={recentTransactions.isLoading || categories.isLoading}
          error={recentTransactions.error ?? categories.error}
          onRetry={recentTransactions.refetch}
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
  );
}

interface SectionBodyProps {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}

function SectionBody({ isLoading, error, onRetry, children }: SectionBodyProps) {
  if (isLoading) {
    return (
      <div className={styles.skeletonStack}>
        <Skeleton height={220} borderRadius={8} />
      </div>
    );
  }
  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  return <>{children}</>;
}
