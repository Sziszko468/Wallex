import { useTranslation } from "react-i18next";
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

const TOTALS = [
  { key: "total_income", labelKey: "common.labels.income", goodWhen: "up" },
  { key: "total_expenses", labelKey: "common.labels.expenses", goodWhen: "down" },
  { key: "balance", labelKey: "common.labels.balance", goodWhen: "up" },
] as const;

/** Month-over-month or year-over-year: totals and categories, differences from the API. */
export function MonthComparison({ comparison, against, onAgainstChange, categoryLimit = 4 }: MonthComparisonProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  const current = comparison.current_month;
  const previous = comparison.previous_month;

  const options: readonly SegmentedOption<ComparisonAgainst>[] = [
    { value: "previous_month", label: t("dashboard.comparison.vsLastMonth") },
    { value: "previous_year", label: t("dashboard.comparison.vsLastYear") },
  ];

  return (
    <div className={styles.comparison}>
      <div className={styles.controls}>
        <SegmentedControl
          options={options}
          value={against}
          onChange={onAgainstChange}
          label={t("dashboard.comparison.compareWith")}
          semantics="pressed"
          size="sm"
        />
        <p className={styles.period}>
          {t("dashboard.comparison.period", {
            current: formatMonthYear(current.year, current.month),
            previous: formatMonthYear(previous.year, previous.month),
          })}
        </p>
      </div>

      <dl className={styles.totals}>
        {TOTALS.map(({ key, labelKey, goodWhen }) => (
          <div key={key} className={styles.total}>
            <dt>{t(labelKey)}</dt>
            <dd>
              <span className={styles.value}>{formatCurrency(current[key], baseCurrency)}</span>
              <span className={styles.previous}>
                {t("dashboard.comparison.was", { amount: formatCurrency(previous[key], baseCurrency) })}
              </span>
              <ChangeBadge value={comparison.percentage_difference[key]} goodWhen={goodWhen} />
            </dd>
          </div>
        ))}
      </dl>

      {comparison.categories.length > 0 && (
        <div className={tableStyles.scroll}>
          <table className={tableStyles.table}>
            <caption className={tableStyles.visuallyHidden}>{t("dashboard.comparison.categories")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("common.labels.category")}</th>
                <th scope="col" className={tableStyles.number}>{t("dashboard.comparison.spent")}</th>
                <th scope="col" className={tableStyles.number}>{t("common.labels.change")}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.categories.slice(0, categoryLimit).map((category) => (
                <tr key={category.category_id}>
                  <th scope="row">{category.category_name}</th>
                  <td className={tableStyles.number}>
                    {formatCurrency(category.current_amount, baseCurrency)}
                    <span className={tableStyles.secondary}>
                      {t("dashboard.comparison.was", { amount: formatCurrency(category.previous_amount, baseCurrency) })}
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
