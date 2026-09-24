import { StyleSheet, Text, View } from "react-native";
import type { Insight, InsightSeverity, InsightType } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

// What the backend-computed `amount` means for each insight type — a label only,
// the value itself is displayed exactly as received.
const AMOUNT_LABELS: Record<InsightType, string> = {
  top_category: "spent",
  category_increase: "more",
  category_decrease: "less",
  budget_exceeded: "over budget",
  budget_warning: "left",
  recurring_share: "recurring per month",
  overspending: "more than earned",
  savings: "saved",
};

const SEVERITY_STYLES: Record<InsightSeverity, { color: string; icon: string }> = {
  alert: { color: colors.danger, icon: "!" },
  warning: { color: colors.warning, icon: "▲" },
  positive: { color: colors.success, icon: "✓" },
  info: { color: colors.primary, icon: "i" },
};

interface InsightsProps {
  insights: Insight[];
}

export function Insights({ insights }: InsightsProps) {
  if (insights.length === 0) {
    return <Text style={styles.empty}>No insights for this month yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {insights.map((insight) => {
        const severity = SEVERITY_STYLES[insight.severity];
        return (
          <View key={insight.id} style={[styles.item, { borderLeftColor: severity.color }]}>
            <View
              style={[styles.icon, { backgroundColor: severity.color }]}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <Text style={styles.iconText}>{severity.icon}</Text>
            </View>
            <View style={styles.text}>
              <Text style={styles.message}>{insight.message}</Text>
              {insight.amount !== null && (
                <Text style={styles.detail}>
                  {formatCurrency(insight.amount)} {AMOUNT_LABELS[insight.type]}
                </Text>
              )}
            </View>
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
  list: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "700",
  },
  text: {
    flex: 1,
  },
  message: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  detail: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
});
