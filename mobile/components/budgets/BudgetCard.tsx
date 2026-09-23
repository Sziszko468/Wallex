import { StyleSheet, Text, View } from "react-native";
import type { Budget } from "../../types/budget";
import type { Category } from "../../types/category";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

interface BudgetCardProps {
  budget: Budget;
  category?: Category;
}

export function BudgetCard({ budget, category }: BudgetCardProps) {
  const isOverBudget = budget.usage_percentage > 100;
  const isNearLimit = !isOverBudget && budget.usage_percentage >= 80;
  const barColor = isOverBudget ? colors.danger : isNearLimit ? colors.warning : colors.success;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.categoryRow}>
          {category && <View style={[styles.dot, { backgroundColor: category.color }]} />}
          <Text style={styles.categoryName}>{category?.name ?? "Overall"}</Text>
        </View>
        <Text style={styles.amountText}>
          {formatCurrency(budget.spent_amount)} / {formatCurrency(budget.amount)}
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

      <View style={styles.footer}>
        <Text style={[styles.footerText, isOverBudget && styles.overBudgetText]}>
          {formatPercentage(budget.usage_percentage)} used
        </Text>
        <Text style={[styles.footerText, isOverBudget && styles.overBudgetText]}>
          {isOverBudget
            ? `Over by ${formatCurrency(Math.abs(Number(budget.remaining_amount)))}`
            : `${formatCurrency(budget.remaining_amount)} left`}
        </Text>
      </View>

      {isOverBudget && (
        <View style={styles.warningBanner} accessibilityRole="alert">
          <Text style={styles.warningText}>⚠ Over budget for this month</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryName: {
    fontSize: fontSize.base,
    fontWeight: "700",
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
    marginBottom: spacing.xs,
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  overBudgetText: {
    color: colors.danger,
    fontWeight: "700",
  },
  warningBanner: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(220, 38, 38, 0.08)",
  },
  warningText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.danger,
  },
});
