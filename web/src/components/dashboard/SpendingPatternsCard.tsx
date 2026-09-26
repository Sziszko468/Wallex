import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SpendingPatterns } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import styles from "./SpendingPatternsCard.module.scss";

interface SpendingPatternsCardProps {
  patterns: SpendingPatterns;
}

/** Average daily spending, spending by weekday and fixed vs variable — every figure from the API. */
export function SpendingPatternsCard({ patterns }: SpendingPatternsCardProps) {
  const baseCurrency = useBaseCurrency();
  if (patterns.days_counted === 0) {
    return <EmptyState message="This month hasn't started yet." />;
  }
  if (patterns.total_expenses === "0.00") {
    return <EmptyState message="No expenses this month yet." />;
  }

  // Numbers only for plotting the bars.
  const weekdayData = patterns.weekdays.map((weekday) => ({
    name: weekday.name.slice(0, 3),
    "Average per day": Number(weekday.average_per_day ?? 0),
  }));

  return (
    <div className={styles.patterns}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Average per day</span>
          <span className={styles.statValue}>
            {patterns.average_daily_spending !== null
              ? formatCurrency(patterns.average_daily_spending, baseCurrency)
              : "—"}
          </span>
          <span className={styles.statHint}>over {patterns.days_counted} days</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Fixed</span>
          <span className={styles.statValue}>{formatCurrency(patterns.fixed_expenses, baseCurrency)}</span>
          <span className={styles.statHint}>
            {patterns.fixed_percentage !== null ? `${formatPercentage(patterns.fixed_percentage)} of spending` : ""}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Variable</span>
          <span className={styles.statValue}>{formatCurrency(patterns.variable_expenses, baseCurrency)}</span>
          <span className={styles.statHint}>
            recurring plan {formatCurrency(patterns.recurring_commitments, baseCurrency)} / month
          </span>
        </div>
      </div>

      {patterns.fixed_percentage !== null && (
        <div
          className={styles.split}
          role="img"
          aria-label={`Fixed ${formatPercentage(patterns.fixed_percentage)}, the rest variable`}
        >
          <div className={styles.fixed} style={{ width: `${patterns.fixed_percentage}%` }} />
          <div className={styles.variable} />
        </div>
      )}

      <div>
        <h3 className={styles.subheading}>Average spending by weekday</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weekdayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(value) => formatCurrency(Number(value), baseCurrency)} />
            <Bar dataKey="Average per day" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
