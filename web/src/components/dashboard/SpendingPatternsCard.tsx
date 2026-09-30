import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SpendingPatterns } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { AXIS_TICK, CHART_COLORS, compactNumber } from "../charts/chartTheme";
import { ChartContainer } from "../charts/ChartContainer";
import { ChartTooltip } from "../charts/ChartTooltip";
import { EmptyState } from "../EmptyState";
import styles from "./SpendingPatternsCard.module.scss";

interface SpendingPatternsCardProps {
  patterns: SpendingPatterns;
}

/** Average daily spending, spending by weekday and fixed vs variable — every figure from the API. */
export function SpendingPatternsCard({ patterns }: SpendingPatternsCardProps) {
  const baseCurrency = useBaseCurrency();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (patterns.days_counted === 0) {
    return <EmptyState icon="calendar" message="This month hasn't started yet." />;
  }
  if (patterns.total_expenses === "0.00") {
    return <EmptyState icon="calendar" message="No expenses this month yet." />;
  }

  // Numbers only for plotting the bars.
  const weekdayData = patterns.weekdays.map((weekday) => ({
    name: weekday.name.slice(0, 3),
    fullName: weekday.name,
    "Average per day": Number(weekday.average_per_day ?? 0),
  }));
  const fullNames = new Map(weekdayData.map((weekday) => [weekday.name, weekday.fullName]));

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
        <ChartContainer label="Average spending for each weekday">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={weekdayData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
              <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={compactNumber} tickCount={4} />
              <Tooltip
                cursor={{ fill: CHART_COLORS.cursor, radius: 8 }}
                content={
                  <ChartTooltip
                    formatValue={(value) => formatCurrency(value, baseCurrency)}
                    formatLabel={(label) => fullNames.get(String(label)) ?? String(label)}
                  />
                }
              />
              <Bar dataKey="Average per day" fill="var(--color-primary)" radius={[6, 6, 2, 2]} maxBarSize={28} isAnimationActive={!reduceMotion} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  );
}
