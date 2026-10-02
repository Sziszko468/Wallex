import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyDataPoint } from "../../types/dashboard";
import { formatCurrency, formatMonthName } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { AXIS_TICK, BAR_CORNER_RADIUS, CHART_COLORS, compactNumber } from "../charts/chartTheme";
import { ChartContainer } from "../charts/ChartContainer";
import { ChartTooltip } from "../charts/ChartTooltip";
import { EmptyState } from "../EmptyState";

interface MonthlySpendingChartProps {
  data: MonthlyDataPoint[];
  /** The month selected above (1–12): its bars are drawn at full strength, the others softer. */
  highlightMonth?: number;
}

const DIMMED_OPACITY = 0.5;

export function MonthlySpendingChart({ data, highlightMonth }: MonthlySpendingChartProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const hasAnyActivity = data.some((point) => point.income !== "0.00" || point.expenses !== "0.00");
  if (!hasAnyActivity) {
    return <EmptyState icon="budgets" message={t("dashboard.monthly.empty")} />;
  }

  // Values are only converted to numbers here so the chart library can plot
  // them — the underlying totals are still whatever the backend computed.
  const chartData = data.map((point) => ({
    name: formatMonthName(point.month, "short"),
    month: point.month,
    income: Number(point.income),
    expenses: Number(point.expenses),
  }));
  const fullNames = new Map(data.map((point) => [formatMonthName(point.month, "short"), formatMonthName(point.month)]));
  const opacityFor = (month: number) => (highlightMonth === undefined || month === highlightMonth ? 1 : DIMMED_OPACITY);

  return (
    <ChartContainer
      label={t("dashboard.monthly.chart")}
      legend={[
        { label: t("common.labels.income"), color: CHART_COLORS.income },
        { label: t("common.labels.expenses"), color: CHART_COLORS.expense },
      ]}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={3} barCategoryGap="24%">
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
          <Bar dataKey="income" name={t("common.labels.income")} fill={CHART_COLORS.income} radius={BAR_CORNER_RADIUS} maxBarSize={14} isAnimationActive={!reduceMotion}>
            {chartData.map((point) => (
              <Cell key={point.month} fillOpacity={opacityFor(point.month)} />
            ))}
          </Bar>
          <Bar dataKey="expenses" name={t("common.labels.expenses")} fill={CHART_COLORS.expense} radius={BAR_CORNER_RADIUS} maxBarSize={14} isAnimationActive={!reduceMotion}>
            {chartData.map((point) => (
              <Cell key={point.month} fillOpacity={opacityFor(point.month)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
