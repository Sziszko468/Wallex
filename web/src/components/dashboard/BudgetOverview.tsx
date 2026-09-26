import type { BudgetStatus, BudgetUsageEntry } from "../../types/dashboard";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { EmptyState } from "../EmptyState";
import styles from "./BudgetOverview.module.scss";

interface BudgetOverviewProps {
  budgets: BudgetUsageEntry[];
}

const STATUS_LABELS: Record<BudgetStatus, string> = {
  on_track: "On track",
  ahead_of_pace: "Ahead of pace",
  over_budget: "Over budget",
};

export function BudgetOverview({ budgets }: BudgetOverviewProps) {
  const baseCurrency = useBaseCurrency();
  if (budgets.length === 0) {
    return <EmptyState message="No budgets set for this month yet." />;
  }

  return (
    <ul className={styles.list}>
      {budgets.map((budget) => {
        const isOverBudget = budget.status === "over_budget";
        // Clamped only for the bar's visual width — the real percentage is
        // still shown as text below, uncapped, straight from the API.
        const barWidth = Math.min(budget.usage_percentage, 100);
        const variance = budget.variance_percentage;

        return (
          <li key={budget.budget_id} className={styles.item}>
            <div className={styles.header}>
              <span className={styles.name}>{budget.category_name}</span>
              <span className={`${styles.status} ${styles[budget.status]}`}>{STATUS_LABELS[budget.status]}</span>
            </div>
            <div className={styles.track}>
              <div
                className={isOverBudget ? `${styles.fill} ${styles.over}` : styles.fill}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className={styles.footer}>
              <span className={isOverBudget ? `${styles.percentage} ${styles.overText}` : styles.percentage}>
                {formatCurrency(budget.spent_amount, baseCurrency)} / {formatCurrency(budget.budget_amount, baseCurrency)}
                {" · "}
                {variance > 0
                  ? `${formatPercentage(variance)} over budget`
                  : `${formatPercentage(Math.abs(variance))} under budget`}
              </span>
              <span className={styles.percentage}>
                expected by now {formatCurrency(budget.expected_to_date, baseCurrency)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
