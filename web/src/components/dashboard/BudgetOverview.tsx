import type { BudgetUsageEntry } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import styles from "./BudgetOverview.module.scss";

interface BudgetOverviewProps {
  budgets: BudgetUsageEntry[];
}

export function BudgetOverview({ budgets }: BudgetOverviewProps) {
  if (budgets.length === 0) {
    return <EmptyState message="No budgets set for this month yet." />;
  }

  return (
    <ul className={styles.list}>
      {budgets.map((budget) => {
        const isOverBudget = budget.usage_percentage > 100;
        // Clamped only for the bar's visual width — the real percentage is
        // still shown as text below, uncapped, straight from the API.
        const barWidth = Math.min(budget.usage_percentage, 100);

        return (
          <li key={budget.budget_id} className={styles.item}>
            <div className={styles.header}>
              <span className={styles.name}>{budget.category_name}</span>
              <span className={styles.amounts}>
                {formatCurrency(budget.spent_amount)} / {formatCurrency(budget.budget_amount)}
              </span>
            </div>
            <div className={styles.track}>
              <div
                className={isOverBudget ? `${styles.fill} ${styles.over}` : styles.fill}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className={isOverBudget ? `${styles.percentage} ${styles.overText}` : styles.percentage}>
              {budget.usage_percentage.toFixed(0)}% used
              {isOverBudget ? " — over budget" : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
