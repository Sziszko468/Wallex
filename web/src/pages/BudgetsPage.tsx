import { useCallback, useMemo, useState } from "react";
import { listBudgets } from "../services/budgetsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import type { Category } from "../types/category";
import { MonthNavigator } from "../components/MonthNavigator";
import { BudgetsTable } from "../components/budgets/BudgetsTable";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import styles from "./BudgetsPage.module.scss";

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function BudgetsPage() {
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

  const budgetsForMonth = useMemo(
    () => (budgets.data ?? []).filter((budget) => budget.year === year && budget.month === month),
    [budgets.data, year, month]
  );

  function handlePeriodChange(nextYear: number, nextMonth: number) {
    setPeriod({ year: nextYear, month: nextMonth });
  }

  const isLoading = budgets.isLoading || categories.isLoading;
  const error = budgets.error ?? categories.error;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Budgets</h1>

      <MonthNavigator year={year} month={month} onChange={handlePeriodChange} />

      {isLoading ? (
        <Skeleton height={220} borderRadius={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={budgets.refetch} />
      ) : (
        <BudgetsTable budgets={budgetsForMonth} categoriesById={categoriesById} />
      )}
    </div>
  );
}
