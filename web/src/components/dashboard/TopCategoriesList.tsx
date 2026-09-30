import type { CategoryBreakdownEntry } from "../../types/dashboard";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { CategoryDot } from "../CategoryMark";
import styles from "./TopCategoriesList.module.scss";

interface TopCategoriesListProps {
  categories: CategoryBreakdownEntry[];
  colorFor: (categoryId: number) => string;
  limit?: number;
}

/** The donut's key: the biggest categories with their amount and share. Empty months are the chart's message to give. */
export function TopCategoriesList({ categories, colorFor, limit = 5 }: TopCategoriesListProps) {
  const baseCurrency = useBaseCurrency();
  if (categories.length === 0) return null;

  // Already sorted by amount descending server-side — just take the head.
  const topCategories = categories.slice(0, limit);

  return (
    <ul className={styles.list} aria-label="Top categories">
      {topCategories.map((entry) => (
        <li key={entry.category_id} className={styles.item}>
          <CategoryDot color={colorFor(entry.category_id)} />
          <span className={styles.name}>{entry.category_name}</span>
          <span className={styles.amount}>{formatCurrency(entry.amount, baseCurrency)}</span>
          <span className={styles.percentage}>{formatPercentage(entry.percentage)}</span>
        </li>
      ))}
    </ul>
  );
}
