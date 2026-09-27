import type { CurrencyCode } from "../../types/currency";
import type { SubscriptionCategoryCost } from "../../types/subscription";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import styles from "./SubscriptionLists.module.scss";

interface SubscriptionCategoryListProps {
  categories: SubscriptionCategoryCost[];
  baseCurrency: CurrencyCode;
  colorFor: (categoryId: number) => string;
}

/** Monthly subscription cost per category — totals and shares computed by the API. */
export function SubscriptionCategoryList({ categories, baseCurrency, colorFor }: SubscriptionCategoryListProps) {
  if (categories.length === 0) {
    return <EmptyState message="No active subscriptions." />;
  }

  return (
    <ul className={styles.list}>
      {categories.map((category) => (
        <li key={category.category_id} className={styles.item}>
          <span className={styles.dot} style={{ backgroundColor: colorFor(category.category_id) }} />
          <span className={styles.name}>
            {category.category_name}
            <span className={styles.secondary}> · {category.subscription_count}</span>
          </span>
          <span className={styles.amount}>
            {formatCurrency(category.monthly_total, baseCurrency)}
            {category.percentage !== null && (
              <span className={styles.secondary}> · {formatPercentage(category.percentage)}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
