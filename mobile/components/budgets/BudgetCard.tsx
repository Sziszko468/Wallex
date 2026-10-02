import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Budget } from "../../types/budget";
import type { Category } from "../../types/category";
import { BUDGET_NEAR_LIMIT_PERCENT, FULL_PERCENT } from "../../config/budget";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

interface BudgetCardProps {
  budget: Budget;
  category?: Category;
}

export function BudgetCard({ budget, category }: BudgetCardProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  const isOverBudget = budget.usage_percentage > FULL_PERCENT;
  const isNearLimit = !isOverBudget && budget.usage_percentage >= BUDGET_NEAR_LIMIT_PERCENT;
  const barColor = isOverBudget ? colors.danger : isNearLimit ? colors.warning : colors.success;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.categoryRow}>
          {category && <View style={[styles.dot, { backgroundColor: category.color }]} />}
          <Text style={styles.categoryName}>{category?.name ?? t("budgets.overall")}</Text>
        </View>
        <Text style={styles.amountText}>
          {formatCurrency(budget.spent_amount, baseCurrency)} / {formatCurrency(budget.amount, baseCurrency)}
        </Text>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(FULL_PERCENT, budget.usage_percentage)}%`, backgroundColor: barColor },
          ]}
        />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, isOverBudget && styles.overBudgetText]}>
          {t("budgets.used", { percentage: formatPercentage(budget.usage_percentage) })}
        </Text>
        <Text style={[styles.footerText, isOverBudget && styles.overBudgetText]}>
          {isOverBudget
            ? t("budgets.over", { amount: formatCurrency(Math.abs(Number(budget.remaining_amount)), baseCurrency) })
            : t("budgets.left", { amount: formatCurrency(budget.remaining_amount, baseCurrency) })}
        </Text>
      </View>

      {isOverBudget && (
        <View style={styles.warningBanner} accessibilityRole="alert">
          <Text style={styles.warningText}>{t("budgets.overBudget")}</Text>
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
