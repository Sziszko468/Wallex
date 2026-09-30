import type { Comparison, ComparisonAgainst } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatMonthYear } from "../../utils/format";
import { SegmentedControl, type SegmentedOption } from "../SegmentedControl";
import { ChangeBadge } from "./ChangeBadge";
import styles from "./MonthComparison.module.scss";
import tableStyles from "./AnalysisTable.module.scss";

interface MonthComparisonProps {
  comparison: Comparison;
  against: ComparisonAgainst;
  onAgainstChange: (against: ComparisonAgainst) => void;
  categoryLimit?: number;
}

const OPTIONS: readonly SegmentedOption<ComparisonAgainst>[] = [
  { value: "previous_month", label: "vs last month" },
  { value: "previous_year", label: "vs last year" },
];

const TOTALS = [
  { key: "total_income", label: "Income", goodWhen: "up" },
  { key: "total_expenses", label: "Expenses", goodWhen: "down" },
  { key: "balance", label: "Balance", goodWhen: "up" },
] as const;

/** Month-over-month or year-over-year: totals and categories, differences from the API. */
export function MonthComparison({ comparison, against, onAgainstChange, categoryLimit = 4 }: MonthComparisonProps) {
  const baseCurrency = useBaseCurrency();
  const current = comparison.current_month;
  const previous = comparison.previous_month;

  return (
    <div className={styles.comparison}>
      <div className={styles.controls}>
        <SegmentedControl
          options={OPTIONS}
          value={against}
          onChange={onAgainstChange}
          label="Compare with"
          semantics="pressed"
          size="sm"
        />
        <p className={styles.period}>
          {formatMonthYear(current.year, current.month)} compared with {formatMonthYear(previous.year, previous.month)}
        </p>
      </div>

      <dl className={styles.totals}>
        {TOTALS.map(({ key, label, goodWhen }) => (
          <div key={key} className={styles.total}>
            <dt>{label}</dt>
            <dd>
              <span className={styles.value}>{formatCurrency(current[key], baseCurrency)}</span>
              <span className={styles.previous}>was {formatCurrency(previous[key], baseCurrency)}</span>
              <ChangeBadge value={comparison.percentage_difference[key]} goodWhen={goodWhen} />
            </dd>
          </div>
        ))}
      </dl>

      {comparison.categories.length > 0 && (
        <div className={tableStyles.scroll}>
          <table className={tableStyles.table}>
            <caption className={tableStyles.visuallyHidden}>Categories compared</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className={tableStyles.number}>Spent</th>
                <th scope="col" className={tableStyles.number}>Change</th>
              </tr>
            </thead>
            <tbody>
              {comparison.categories.slice(0, categoryLimit).map((category) => (
                <tr key={category.category_id}>
                  <th scope="row">{category.category_name}</th>
                  <td className={tableStyles.number}>
                    {formatCurrency(category.current_amount, baseCurrency)}
                    <span className={tableStyles.secondary}>
                      was {formatCurrency(category.previous_amount, baseCurrency)}
                    </span>
                  </td>
                  <td className={tableStyles.number}>
                    <ChangeBadge value={category.change_percentage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
