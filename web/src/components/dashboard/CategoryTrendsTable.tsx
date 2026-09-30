import type { Trends } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatShortMonth } from "../../utils/format";
import { CategoryDot } from "../CategoryMark";
import { EmptyState } from "../EmptyState";
import { ChangeBadge } from "./ChangeBadge";
import styles from "./AnalysisTable.module.scss";

interface CategoryTrendsTableProps {
  trends: Trends;
  colorFor: (categoryId: number) => string;
  limit?: number;
}

/** Each category's last two months, e.g. Food: Aug €280 → Sep €320, +14.3%. */
export function CategoryTrendsTable({ trends, colorFor, limit = 6 }: CategoryTrendsTableProps) {
  const baseCurrency = useBaseCurrency();
  const previous = trends.months[trends.months.length - 2];
  const latest = trends.months[trends.months.length - 1];
  if (trends.categories.length === 0 || !previous || !latest) {
    return <EmptyState icon="categories" message="No spending in these months yet." />;
  }

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>Category trends</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" className={styles.number}>{formatShortMonth(previous.year, previous.month)}</th>
            <th scope="col" className={styles.number}>{formatShortMonth(latest.year, latest.month)}</th>
            <th scope="col" className={styles.number}>Change</th>
          </tr>
        </thead>
        <tbody>
          {trends.categories.slice(0, limit).map((category) => (
            <tr key={category.category_id}>
              <th scope="row">
                <span className={styles.category}>
                  <CategoryDot color={colorFor(category.category_id)} />
                  {category.category_name}
                </span>
              </th>
              <td className={styles.number}>
                {formatCurrency(category.amounts[category.amounts.length - 2] ?? "0", baseCurrency)}
              </td>
              <td className={styles.number}>
                {formatCurrency(category.amounts[category.amounts.length - 1] ?? "0", baseCurrency)}
              </td>
              <td className={styles.number}>
                <ChangeBadge value={category.change_percentage} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
