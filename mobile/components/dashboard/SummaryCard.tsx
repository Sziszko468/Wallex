import { StyleSheet, Text, View } from "react-native";
import type { DashboardStats } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

interface SummaryCardProps {
  stats: DashboardStats;
}

export function SummaryCard({ stats }: SummaryCardProps) {
  const baseCurrency = useBaseCurrency();
  const balance = Number(stats.balance);

  return (
    <View>
      <Text style={styles.balanceLabel}>Balance</Text>
      <Text style={[styles.balanceValue, balance < 0 && styles.negative]}>
        {formatCurrency(stats.balance, baseCurrency)}
      </Text>

      <View style={styles.row}>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>↑ Income</Text>
          <Text style={[styles.pillValue, styles.income]}>{formatCurrency(stats.total_income, baseCurrency)}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>↓ Expenses</Text>
          <Text style={[styles.pillValue, styles.expense]}>
            {formatCurrency(stats.total_expenses, baseCurrency)}
          </Text>
        </View>
      </View>

      <Text style={styles.count}>
        {stats.transaction_count} transaction{stats.transaction_count === 1 ? "" : "s"} this month
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  balanceLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.success,
    marginBottom: spacing.md,
  },
  negative: {
    color: colors.danger,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pill: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  pillLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: 2,
  },
  pillValue: {
    fontSize: fontSize.base,
    fontWeight: "700",
  },
  income: {
    color: colors.success,
  },
  expense: {
    color: colors.danger,
  },
  count: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
