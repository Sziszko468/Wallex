import type { CategoryBreakdownEntry } from "../../types/dashboard";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import styles from "./TopCategoriesList.module.scss";

interface TopCategoriesListProps {
  categories: CategoryBreakdownEntry[];
  colorFor: (categoryId: number) => string;
  limit?: number;
}

export function TopCategoriesList({ categories, colorFor, limit = 5 }: TopCategoriesListProps) {
  if (categories.length === 0) {
    return <EmptyState message="No expenses recorded this month yet." />;
  }

  // Already sorted by amount descending server-side — just take the head.
  const topCategories = categories.slice(0, limit);

  return (
    <ul className={styles.list}>
      {topCategories.map((entry) => (
        <li key={entry.category_id} className={styles.item}>
          <span className={styles.dot} style={{ backgroundColor: colorFor(entry.category_id) }} />
          <span className={styles.name}>{entry.category_name}</span>
          <span className={styles.amount}>{formatCurrency(entry.amount)}</span>
          <span className={styles.percentage}>{formatPercentage(entry.percentage)}</span>
        </li>
      ))}
    </ul>
  );
}
