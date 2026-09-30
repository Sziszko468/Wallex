import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Trends } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { formatCurrency, formatMonthYear, formatShortMonth } from "../../utils/format";
import { AXIS_TICK, CHART_COLORS, compactNumber } from "../charts/chartTheme";
import { ChartContainer } from "../charts/ChartContainer";
import { ChartTooltip } from "../charts/ChartTooltip";
import { EmptyState } from "../EmptyState";
import { ChangeBadge } from "./ChangeBadge";
import styles from "./SpendingTrend.module.scss";

interface SpendingTrendProps {
  trends: Trends;
}

/** Income and expenses over the last months, with each month's change — all computed by the API. */
export function SpendingTrend({ trends }: SpendingTrendProps) {
  const baseCurrency = useBaseCurrency();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { months } = trends;
  const hasActivity = months.some((point) => point.income !== "0.00" || point.expenses !== "0.00");
  if (!hasActivity) {
    return <EmptyState icon="trending-up" message="No transactions in these months yet." />;
  }

  const crossesYear = months[0]?.year !== months[months.length - 1]?.year;
  // Numbers only for plotting; the figures themselves come from the backend.
  const chartData = months.map((point) => ({
    name: formatShortMonth(point.year, point.month, crossesYear),
    fullName: formatMonthYear(point.year, point.month),
    Expenses: Number(point.expenses),
    Income: Number(point.income),
  }));
  const fullNames = new Map(chartData.map((point) => [point.name, point.fullName]));

  return (
    <div className={styles.trend}>
      <ChartContainer
        label="Income and expenses over the last months"
        legend={[
          { label: "Expenses", color: CHART_COLORS.expense },
          { label: "Income", color: CHART_COLORS.income },
        ]}
      >
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={compactNumber} tickCount={4} />
            <Tooltip
              content={
                <ChartTooltip
                  formatValue={(value) => formatCurrency(value, baseCurrency)}
                  formatLabel={(label) => fullNames.get(String(label)) ?? String(label)}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="Expenses"
              stroke={CHART_COLORS.expense}
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.expense }}
              activeDot={{ r: 5 }}
              isAnimationActive={!reduceMotion}
            />
            <Line
              type="monotone"
              dataKey="Income"
              stroke={CHART_COLORS.income}
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.income }}
              activeDot={{ r: 5 }}
              isAnimationActive={!reduceMotion}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>

      <p className={styles.average}>
        Average spending: <strong>{formatCurrency(trends.average_monthly_expenses, baseCurrency)}</strong> / month
      </p>

      <ul className={styles.months} aria-label="Expenses per month">
        {months.map((point) => (
          <li key={`${point.year}-${point.month}`} className={styles.month}>
            <span className={styles.monthName}>{formatShortMonth(point.year, point.month, crossesYear)}</span>
            <span className={styles.amount}>{formatCurrency(point.expenses, baseCurrency)}</span>
            <ChangeBadge value={point.expenses_change_percentage} />
          </li>
        ))}
      </ul>
    </div>
  );
}
