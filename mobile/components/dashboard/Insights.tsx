import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Insight, InsightSeverity } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

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
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  if (insights.length === 0) {
    return <Text style={styles.empty}>{t("dashboard.insights.empty")}</Text>;
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
                  {/* What the amount means depends on the insight type; the value is shown as received. */}
                  {t(`dashboard.insights.amount.${insight.type}`, { amount: formatCurrency(insight.amount, baseCurrency) })}
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
