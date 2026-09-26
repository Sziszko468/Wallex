import { StyleSheet, Text, View } from "react-native";
import type { BudgetUsageEntry } from "../../types/dashboard";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { colors, fontSize, spacing } from "../../utils/theme";

interface BudgetStatusProps {
  budgets: BudgetUsageEntry[];
}

export function BudgetStatus({ budgets }: BudgetStatusProps) {
  const baseCurrency = useBaseCurrency();
  if (budgets.length === 0) {
    return <Text style={styles.empty}>No budgets set for this month.</Text>;
  }

  return (
    <View>
      {budgets.map((budget) => {
        const isOverBudget = budget.usage_percentage > 100;
        const barColor = isOverBudget
          ? colors.danger
          : budget.usage_percentage >= 80
            ? colors.warning
            : colors.success;

        return (
          <View key={budget.budget_id} style={styles.item}>
            <View style={styles.itemHeader}>
              <Text style={styles.name}>{budget.category_name || "Overall"}</Text>
              <Text style={styles.amountText}>
                {formatCurrency(budget.spent_amount, baseCurrency)} / {formatCurrency(budget.budget_amount, baseCurrency)}
              </Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.min(100, budget.usage_percentage)}%`, backgroundColor: barColor },
                ]}
              />
            </View>
            <Text style={[styles.status, isOverBudget && styles.statusOver]}>
              {isOverBudget
                ? `Over budget by ${formatCurrency(Math.abs(Number(budget.remaining_amount)), baseCurrency)}`
                : `${formatCurrency(budget.remaining_amount, baseCurrency)} left · ${formatPercentage(
                    budget.usage_percentage
                  )}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  item: {
    marginBottom: spacing.md,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  amountText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
  status: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textMuted,
  },
  statusOver: {
    color: colors.danger,
    fontWeight: "600",
  },
});
