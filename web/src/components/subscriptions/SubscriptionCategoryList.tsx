import { useTranslation } from "react-i18next";
import type { CurrencyCode } from "../../types/currency";
import type { SubscriptionCategoryCost } from "../../types/subscription";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { CategoryDot } from "../CategoryMark";
import { EmptyState } from "../EmptyState";
import styles from "./SubscriptionLists.module.scss";

interface SubscriptionCategoryListProps {
  categories: SubscriptionCategoryCost[];
  baseCurrency: CurrencyCode;
  colorFor: (categoryId: number) => string;
}

/** Monthly subscription cost per category — totals and shares computed by the API. */
export function SubscriptionCategoryList({ categories, baseCurrency, colorFor }: SubscriptionCategoryListProps) {
  const { t } = useTranslation();
  if (categories.length === 0) {
    return <EmptyState icon="subscriptions" message={t("subscriptions.categoryList.empty")} />;
  }

  return (
    <ul className={styles.list}>
      {categories.map((category) => (
        <li key={category.category_id} className={styles.item}>
          <CategoryDot color={colorFor(category.category_id)} />
          <span className={styles.name}>
            {category.category_name}
            <span className={styles.count}> · {category.subscription_count}</span>
          </span>
          <span className={styles.amount}>
            <span>{formatCurrency(category.monthly_total, baseCurrency)}</span>
            {category.percentage !== null && (
              <span className={styles.secondary}>{formatPercentage(category.percentage)}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
