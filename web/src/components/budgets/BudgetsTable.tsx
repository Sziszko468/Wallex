import type { Budget } from "../../types/budget";
import type { Category } from "../../types/category";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { EmptyState } from "../EmptyState";
import styles from "./BudgetsTable.module.scss";

interface BudgetsTableProps {
  budgets: Budget[];
  categoriesById: Map<number, Category>;
}

export function BudgetsTable({ budgets, categoriesById }: BudgetsTableProps) {
  const baseCurrency = useBaseCurrency();
  if (budgets.length === 0) {
    return <EmptyState message="No budgets set for this month." />;
  }

  // Surface the most at-risk budgets first — a display-only reorder of
  // already-computed rows, not a recalculation of anything.
  const sorted = [...budgets].sort((a, b) => b.usage_percentage - a.usage_percentage);

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>Budgets</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Spent</th>
            <th scope="col">Budget</th>
            <th scope="col">Remaining</th>
            <th scope="col">Usage %</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((budget) => {
            const category = budget.category ? categoriesById.get(budget.category) : undefined;
            const isOverBudget = budget.usage_percentage > 100;
            const isNearLimit = !isOverBudget && budget.usage_percentage >= 80;
            const fillClass = isOverBudget
              ? styles.fillDanger
              : isNearLimit
                ? styles.fillWarning
                : styles.fillSuccess;

            return (
              <tr key={budget.id}>
                <td>
                  <span className={styles.categoryBadge}>
                    {category && (
                      <span className={styles.dot} style={{ backgroundColor: category.color }} />
                    )}
                    {category?.name ?? "Overall"}
                  </span>
                </td>
                <td>{formatCurrency(budget.spent_amount, baseCurrency)}</td>
                <td>{formatCurrency(budget.amount, baseCurrency)}</td>
                <td className={isOverBudget ? styles.overBudget : undefined}>
                  {isOverBudget
                    ? `${formatCurrency(Math.abs(Number(budget.remaining_amount)), baseCurrency)} over`
                    : formatCurrency(budget.remaining_amount, baseCurrency)}
                </td>
                <td>
                  <div className={styles.usageCell}>
                    <div className={styles.track}>
                      <div
                        className={fillClass}
                        style={{ width: `${Math.min(100, budget.usage_percentage)}%` }}
                      />
                    </div>
                    <span className={isOverBudget ? styles.overBudget : undefined}>
                      {formatPercentage(budget.usage_percentage)}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
