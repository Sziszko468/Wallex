import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { BudgetUsageEntry } from "../../types/dashboard";
import { BUDGET_NEAR_LIMIT_PERCENT, FULL_PERCENT } from "../../config/budget";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { colors, fontSize, spacing } from "../../utils/theme";

interface BudgetStatusProps {
  budgets: BudgetUsageEntry[];
}

export function BudgetStatus({ budgets }: BudgetStatusProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  if (budgets.length === 0) {
    return <Text style={styles.empty}>{t("dashboard.budgetStatus.empty")}</Text>;
  }

  return (
    <View>
      {budgets.map((budget) => {
        const isOverBudget = budget.usage_percentage > FULL_PERCENT;
        const barColor = isOverBudget
          ? colors.danger
          : budget.usage_percentage >= BUDGET_NEAR_LIMIT_PERCENT
            ? colors.warning
            : colors.success;

        return (
          <View key={budget.budget_id} style={styles.item}>
            <View style={styles.itemHeader}>
              <Text style={styles.name}>{budget.category_name || t("dashboard.budgetStatus.overall")}</Text>
              <Text style={styles.amountText}>
                {formatCurrency(budget.spent_amount, baseCurrency)} / {formatCurrency(budget.budget_amount, baseCurrency)}
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
            <Text style={[styles.status, isOverBudget && styles.statusOver]}>
              {isOverBudget
                ? t("dashboard.budgetStatus.over", { amount: formatCurrency(Math.abs(Number(budget.remaining_amount)), baseCurrency) })
                : t("dashboard.budgetStatus.left", {
                    amount: formatCurrency(budget.remaining_amount, baseCurrency),
                    percentage: formatPercentage(budget.usage_percentage),
                  })}
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
