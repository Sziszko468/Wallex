import { useCallback, useMemo, useState, type ReactNode } from "react";
import { getCategoryAnalytics, getDashboard, getMonthlyAnalytics } from "../services/analyticsService";
import { listCategories } from "../services/categoriesService";
import { listTransactions } from "../services/transactionsService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useAuth } from "../hooks/useAuth";
import type { Category } from "../types/category";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { StatCard } from "../components/dashboard/StatCard";
import { MonthNavigator } from "../components/MonthNavigator";
import { MonthlySpendingChart } from "../components/dashboard/MonthlySpendingChart";
import { CategoryPieChart } from "../components/dashboard/CategoryPieChart";
import { BudgetOverview } from "../components/dashboard/BudgetOverview";
import { TopCategoriesList } from "../components/dashboard/TopCategoriesList";
import { RecentTransactionsList } from "../components/dashboard/RecentTransactionsList";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { formatCurrency } from "../utils/format";
import styles from "./DashboardPage.module.scss";

const RECENT_TRANSACTIONS_LIMIT = 5;
const FALLBACK_CATEGORY_COLOR = "#9ca3af";

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function DashboardPage() {
  const { user } = useAuth();
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
            value={stats.data ? formatCurrency(stats.data.total_income) : undefined}
            tone="positive"
            isLoading={stats.isLoading}
          />
          <StatCard
            label="Expenses"
            value={stats.data ? formatCurrency(stats.data.total_expenses) : undefined}
            tone="negative"
            isLoading={stats.isLoading}
          />
          <StatCard
            label="Balance"
            value={stats.data ? formatCurrency(stats.data.balance) : undefined}
            tone={balanceTone}
            isLoading={stats.isLoading}
          />
        </div>
      )}

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
