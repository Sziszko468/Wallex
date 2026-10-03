import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { makeStyles, radius, space, useTheme } from "../../theme";
import type { MonthlyDataPoint } from "../../types/dashboard";
import { formatCurrency, formatMonthName } from "../../utils/format";
import { Text } from "../ui/Text";

interface MonthlyBarsProps {
  months: MonthlyDataPoint[];
  selectedMonth: number;
  onSelect: (month: number) => void;
}

const BARS_HEIGHT = 132;
const BAR_WIDTH = 9;
const MIN_BAR_HEIGHT = 4;

const useStyles = makeStyles(({ colors }) => ({
  readout: { gap: space[2], marginBottom: space[4] },
  figures: { flexDirection: "row", gap: space[5] },
  figure: { flexDirection: "row", alignItems: "center", gap: space[2] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chart: { flexDirection: "row" },
  column: { flex: 1, alignItems: "center", gap: space[2], paddingTop: space[2], paddingBottom: space[2], borderRadius: radius.sm },
  columnSelected: { backgroundColor: colors.bgSubtle },
  bars: { height: BARS_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: 2 },
}));

/**
 * Twelve months of income and expenses as touchable columns — tap one to read its figures above
 * (and, on the analytics screen, to look at that month below). Plain Views, no chart library.
 * Amounts are converted to Number only to size the bars; every figure shown is the API's own.
 */
export function MonthlyBars({ months, selectedMonth, onSelect }: MonthlyBarsProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const baseCurrency = useBaseCurrency();
  const maxValue = Math.max(1, ...months.flatMap((point) => [Number(point.income), Number(point.expenses)]));
  const selected = months.find((point) => point.month === selectedMonth);

  function barHeight(amount: string): number {
    const value = Number(amount);
    return value > 0 ? Math.max(MIN_BAR_HEIGHT, (value / maxValue) * BARS_HEIGHT) : 0;
  }

  return (
    <View>
      {selected ? (
        <View style={styles.readout} accessibilityLiveRegion="polite">
          <Text variant="label" color="textSecondary">
            {formatMonthName(selected.month)}
          </Text>
          <View style={styles.figures}>
            <View style={styles.figure}>
              <View style={[styles.dot, { backgroundColor: colors.chartIncome }]} />
              <View>
                <Text variant="caption" color="textSecondary">
                  {t("analytics.months.income")}
                </Text>
                <Text variant="amount">{formatCurrency(selected.income, baseCurrency)}</Text>
              </View>
            </View>
            <View style={styles.figure}>
              <View style={[styles.dot, { backgroundColor: colors.chartExpense }]} />
              <View>
                <Text variant="caption" color="textSecondary">
                  {t("analytics.months.expenses")}
                </Text>
                <Text variant="amount">{formatCurrency(selected.expenses, baseCurrency)}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.chart}>
        {months.map((point) => {
          const isSelected = point.month === selectedMonth;
          return (
            <Pressable
              key={point.month}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={t("analytics.months.column", {
                month: formatMonthName(point.month),
                income: formatCurrency(point.income, baseCurrency),
                expenses: formatCurrency(point.expenses, baseCurrency),
              })}
              onPress={() => onSelect(point.month)}
              style={[styles.column, isSelected && styles.columnSelected]}
            >
              <View style={styles.bars}>
                <View style={{ width: BAR_WIDTH, height: barHeight(point.income), borderRadius: 3, backgroundColor: colors.chartIncome }} />
                <View style={{ width: BAR_WIDTH, height: barHeight(point.expenses), borderRadius: 3, backgroundColor: colors.chartExpense }} />
              </View>
              <Text variant="small" color={isSelected ? "text" : "textTertiary"} numberOfLines={1} style={{ fontSize: 10, lineHeight: 14 }}>
                {formatMonthName(point.month, "short")}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
