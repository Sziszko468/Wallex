import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategoryBreakdownEntry } from "../../types/dashboard";
import { categoryTone } from "../../utils/categoryStyle";
import { formatCurrency } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { ChartContainer } from "../charts/ChartContainer";
import { ChartTooltip } from "../charts/ChartTooltip";
import { EmptyState } from "../EmptyState";
import styles from "./CategoryDonutChart.module.scss";

interface CategoryDonutChartProps {
  data: CategoryBreakdownEntry[];
  colorFor: (categoryId: number) => string;
}

/** Where the month's spending went, as soft rounded segments. The largest category is named in the middle. */
export function CategoryDonutChart({ data, colorFor }: CategoryDonutChartProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (data.length === 0) {
    return <EmptyState icon="budgets" message={t("dashboard.byCategory.empty")} />;
  }

  // Same as the monthly chart: Number(...) here is purely for the charting
  // library's benefit, not a recomputation of the (already-final) amount.
  const chartData = data.map((entry) => ({
    id: entry.category_id,
    name: entry.category_name,
    value: Number(entry.amount),
    fill: categoryTone(colorFor(entry.category_id)),
  }));
  const largest = data[0];

  return (
    <ChartContainer label={t("dashboard.byCategory.chart")}>
      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="66%"
              outerRadius="96%"
              paddingAngle={3}
              cornerRadius={7}
              stroke="none"
              isAnimationActive={!reduceMotion}
            >
              {chartData.map((entry) => (
                <Cell key={entry.id} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatValue={(value) => formatCurrency(value, baseCurrency)} />} />
          </PieChart>
        </ResponsiveContainer>
        {largest && (
          <div className={styles.center} aria-hidden="true">
            <span className={styles.label}>{t("dashboard.byCategory.largest")}</span>
            <span className={styles.name}>{largest.category_name}</span>
          </div>
        )}
      </div>
    </ChartContainer>
  );
}
