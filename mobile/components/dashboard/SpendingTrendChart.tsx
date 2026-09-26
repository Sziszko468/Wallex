import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { MonthlyDataPoint } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { colors, fontSize, spacing } from "../../utils/theme";

interface SpendingTrendChartProps {
  months: MonthlyDataPoint[];
  selectedMonth: number;
}

const CHART_HEIGHT = 90;
const COLUMN_WIDTH = 34;
const BAR_WIDTH = 10;

/**
 * Plain View-based bar chart — no charting library. Horizontally scrollable
 * so all 12 months stay legible instead of being squeezed onto one screen.
 * Amounts are converted to Number only to compute bar heights, never summed
 * or otherwise used to derive a financial figure (the backend already
 * computed every value here).
 */
export function SpendingTrendChart({ months, selectedMonth }: SpendingTrendChartProps) {
  const baseCurrency = useBaseCurrency();
  const maxValue = Math.max(1, ...months.flatMap((m) => [Number(m.income), Number(m.expenses)]));

  return (
    <View>
      <View style={styles.legend}>
        <LegendDot color={colors.success} label="Income" />
        <LegendDot color={colors.danger} label="Expenses" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {months.map((point) => {
            const income = Number(point.income);
            const expenses = Number(point.expenses);
            const isSelected = point.month === selectedMonth;

            return (
              <View
                key={point.month}
                style={[styles.column, isSelected && styles.columnSelected]}
                accessible
                accessibilityLabel={`${point.month_name}: income ${formatCurrency(point.income, baseCurrency)}, expenses ${formatCurrency(point.expenses, baseCurrency)}`}
              >
                <View style={styles.bars}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(2, (income / maxValue) * CHART_HEIGHT),
                        backgroundColor: colors.success,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(2, (expenses / maxValue) * CHART_HEIGHT),
                        backgroundColor: colors.danger,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.columnLabel}>{point.month_name.slice(0, 3)}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: CHART_HEIGHT + 28,
    paddingHorizontal: spacing.xs,
  },
  column: {
    width: COLUMN_WIDTH,
    alignItems: "center",
    borderRadius: 6,
    paddingTop: spacing.xs,
  },
  columnSelected: {
    backgroundColor: colors.background,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: CHART_HEIGHT,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 3,
  },
  columnLabel: {
    marginTop: spacing.xs,
    fontSize: 11,
    color: colors.textMuted,
  },
});
