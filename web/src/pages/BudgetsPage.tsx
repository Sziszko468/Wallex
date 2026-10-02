import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BUDGET_NEAR_LIMIT_PERCENT, FULL_PERCENT } from "../config/budget";
import { listBudgets } from "../services/budgetsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageTitle } from "../hooks/usePageTitle";
import type { Budget } from "../types/budget";
import type { Category } from "../types/category";
import { formatMonthYear } from "../utils/format";
import { BudgetRow, type BudgetRowStatus } from "../components/budgets/BudgetRow";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { MonthNavigator } from "../components/MonthNavigator";
import { PageHeader } from "../components/PageHeader";
import { Skeleton } from "../components/Skeleton";
import pageStyles from "../components/page.module.scss";
import styles from "./BudgetsPage.module.scss";

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Near the limit from BUDGET_NEAR_LIMIT_PERCENT — the same threshold the warning notifications use. */
function statusOf(budget: Budget): BudgetRowStatus {
  if (budget.usage_percentage > FULL_PERCENT) return "over_budget";
  return budget.usage_percentage >= BUDGET_NEAR_LIMIT_PERCENT ? "near_limit" : "on_track";
}

export function BudgetsPage() {
  const { t } = useTranslation();
  usePageTitle(t("budgets.title"));
  const [{ year, month }, setPeriod] = useState(currentPeriod);

  // Not paginated or filterable server-side — fetch once, filter by the
  // selected month on the client (pure row selection, no recalculation).
  const fetchBudgets = useCallback(() => listBudgets(), []);
  const budgets = useAsyncData(fetchBudgets);

  const fetchCategories = useCallback(() => listCategories(), []);
  const categories = useAsyncData(fetchCategories);

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    for (const category of categories.data ?? []) map.set(category.id, category);
    return map;
  }, [categories.data]);

  // Surface the most at-risk budgets first — a display-only reorder of
  // already-computed rows, not a recalculation of anything.
  const budgetsForMonth = useMemo(
    () =>
      (budgets.data ?? [])
        .filter((budget) => budget.year === year && budget.month === month)
        .sort((a, b) => b.usage_percentage - a.usage_percentage),
    [budgets.data, year, month]
  );

  function handlePeriodChange(nextYear: number, nextMonth: number) {
    setPeriod({ year: nextYear, month: nextMonth });
  }

  const isLoading = budgets.isLoading || categories.isLoading;
  const error = budgets.error ?? categories.error;

  function renderBudgets() {
    if (isLoading) {
      return (
        <div className={styles.grid}>
          <Skeleton height={150} borderRadius={16} />
          <Skeleton height={150} borderRadius={16} />
          <Skeleton height={150} borderRadius={16} />
        </div>
      );
    }
    if (error) return <ErrorState error={error} onRetry={budgets.refetch} />;
    if (budgetsForMonth.length === 0) {
      return (
        <EmptyState
          icon="budgets"
          title={t("budgets.emptyTitle", { period: formatMonthYear(year, month) })}
          message={t("budgets.emptyMessage")}
        />
      );
    }
    return (
      <ul className={styles.grid}>
        {budgetsForMonth.map((budget) => {
          const category = budget.category ? categoriesById.get(budget.category) : undefined;
          return (
            <BudgetRow
              key={budget.id}
              card
              name={category?.name ?? t("budgets.overall")}
              category={category}
              spent={budget.spent_amount}
              budget={budget.amount}
              remaining={budget.remaining_amount}
              usagePercentage={budget.usage_percentage}
              status={statusOf(budget)}
            />
          );
        })}
      </ul>
    );
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={t("budgets.title")}
        description={t("budgets.description")}
        actions={<MonthNavigator year={year} month={month} onChange={handlePeriodChange} />}
      />
      {renderBudgets()}
    </div>
  );
}
