import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Trans, useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { months } = trends;
  const hasActivity = months.some((point) => point.income !== "0.00" || point.expenses !== "0.00");
  if (!hasActivity) {
    return <EmptyState icon="trending-up" message={t("dashboard.trend.empty")} />;
  }

  const crossesYear = months[0]?.year !== months[months.length - 1]?.year;
  // Numbers only for plotting; the figures themselves come from the backend.
  const chartData = months.map((point) => ({
    name: formatShortMonth(point.year, point.month, crossesYear),
    fullName: formatMonthYear(point.year, point.month),
    expenses: Number(point.expenses),
    income: Number(point.income),
  }));
  const fullNames = new Map(chartData.map((point) => [point.name, point.fullName]));

  return (
    <div className={styles.trend}>
      <ChartContainer
        label={t("dashboard.trend.chart")}
        legend={[
          { label: t("common.labels.expenses"), color: CHART_COLORS.expense },
          { label: t("common.labels.income"), color: CHART_COLORS.income },
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
              dataKey="expenses"
              name={t("common.labels.expenses")}
              stroke={CHART_COLORS.expense}
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.expense }}
              activeDot={{ r: 5 }}
              isAnimationActive={!reduceMotion}
            />
            <Line
              type="monotone"
              dataKey="income"
              name={t("common.labels.income")}
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
        <Trans
          i18nKey="dashboard.trend.average"
          values={{ amount: formatCurrency(trends.average_monthly_expenses, baseCurrency) }}
          components={{ strong: <strong /> }}
        />
      </p>

      <ul className={styles.months} aria-label={t("dashboard.trend.monthsList")}>
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
