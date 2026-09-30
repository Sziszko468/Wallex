import type { Category } from "../../types/category";
import type { BudgetUsageEntry } from "../../types/dashboard";
import { EmptyState } from "../EmptyState";
import { BudgetRow } from "../budgets/BudgetRow";
import styles from "./BudgetOverview.module.scss";

interface BudgetOverviewProps {
  budgets: BudgetUsageEntry[];
  categoriesById: Map<number, Category>;
}

export function BudgetOverview({ budgets, categoriesById }: BudgetOverviewProps) {
  if (budgets.length === 0) {
    return (
      <EmptyState
        icon="budgets"
        message="No budgets set for this month yet."
      />
    );
  }

  return (
    <ul className={styles.list}>
      {budgets.map((budget) => (
        <BudgetRow
          key={budget.budget_id}
          name={budget.category_name}
          category={budget.category_id === null ? undefined : categoriesById.get(budget.category_id)}
          spent={budget.spent_amount}
          budget={budget.budget_amount}
          remaining={budget.remaining_amount}
          usagePercentage={budget.usage_percentage}
          status={budget.status}
          variancePercentage={budget.variance_percentage}
          expectedToDate={budget.expected_to_date}
        />
      ))}
    </ul>
  );
}
