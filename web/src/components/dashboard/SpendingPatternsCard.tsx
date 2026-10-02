import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import type { SpendingPatterns } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { formatCurrency, formatPercentage, formatWeekdayName } from "../../utils/format";
import { AXIS_TICK, BAR_CORNER_RADIUS, CHART_COLORS, compactNumber } from "../charts/chartTheme";
import { ChartContainer } from "../charts/ChartContainer";
import { ChartTooltip } from "../charts/ChartTooltip";
import { EmptyState } from "../EmptyState";
import styles from "./SpendingPatternsCard.module.scss";

interface SpendingPatternsCardProps {
  patterns: SpendingPatterns;
}

/** Average daily spending, spending by weekday and fixed vs variable — every figure from the API. */
export function SpendingPatternsCard({ patterns }: SpendingPatternsCardProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (patterns.days_counted === 0) {
    return <EmptyState icon="calendar" message={t("dashboard.patterns.notStarted")} />;
  }
  if (patterns.total_expenses === "0.00") {
    return <EmptyState icon="calendar" message={t("dashboard.patterns.noExpenses")} />;
  }

  // Numbers only for plotting the bars.
  const weekdayData = patterns.weekdays.map((weekday) => ({
    name: formatWeekdayName(weekday.weekday, "short"),
    fullName: formatWeekdayName(weekday.weekday),
    averagePerDay: Number(weekday.average_per_day ?? 0),
  }));
  const fullNames = new Map(weekdayData.map((weekday) => [weekday.name, weekday.fullName]));

  return (
    <div className={styles.patterns}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t("dashboard.patterns.averagePerDay")}</span>
          <span className={styles.statValue}>
            {patterns.average_daily_spending !== null
              ? formatCurrency(patterns.average_daily_spending, baseCurrency)
              : t("common.states.notAvailable")}
          </span>
          <span className={styles.statHint}>{t("dashboard.patterns.overDays", { count: patterns.days_counted })}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t("dashboard.patterns.fixed")}</span>
          <span className={styles.statValue}>{formatCurrency(patterns.fixed_expenses, baseCurrency)}</span>
          <span className={styles.statHint}>
            {patterns.fixed_percentage !== null
              ? t("dashboard.patterns.ofSpending", { percentage: formatPercentage(patterns.fixed_percentage) })
              : ""}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t("dashboard.patterns.variable")}</span>
          <span className={styles.statValue}>{formatCurrency(patterns.variable_expenses, baseCurrency)}</span>
          <span className={styles.statHint}>
            {t("dashboard.patterns.recurringPlan", { amount: formatCurrency(patterns.recurring_commitments, baseCurrency) })}
          </span>
        </div>
      </div>

      {patterns.fixed_percentage !== null && (
        <div
          className={styles.split}
          role="img"
          aria-label={t("dashboard.patterns.splitLabel", { percentage: formatPercentage(patterns.fixed_percentage) })}
        >
          <div className={styles.fixed} style={{ width: `${patterns.fixed_percentage}%` }} />
          <div className={styles.variable} />
        </div>
      )}

      <div>
        <h3 className={styles.subheading}>{t("dashboard.patterns.weekdayTitle")}</h3>
        <ChartContainer label={t("dashboard.patterns.weekdayChart")}>
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
              <Bar
                dataKey="averagePerDay"
                name={t("dashboard.patterns.averagePerDay")}
                fill="var(--color-primary)"
                radius={BAR_CORNER_RADIUS}
                maxBarSize={28}
                isAnimationActive={!reduceMotion}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  );
}
