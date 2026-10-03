import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { makeStyles, radius, space, useTheme, type Palette } from "../../theme";
import type { Insight, InsightSeverity } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Text } from "../ui/Text";

/** How many insights the home screen shows before "Show more". */
const VISIBLE_COUNT = 2;

const SEVERITY: Record<InsightSeverity, { icon: IconName; ink: keyof Palette; background: keyof Palette }> = {
  alert: { icon: "alert-circle", ink: "danger", background: "dangerSoft" },
  warning: { icon: "alert-triangle", ink: "warning", background: "warningSoft" },
  positive: { icon: "check-circle", ink: "success", background: "successSoft" },
  info: { icon: "info", ink: "info", background: "infoSoft" },
};

interface InsightsProps {
  insights: Insight[];
}

const useStyles = makeStyles(({ colors }) => ({
  item: { flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingVertical: space[3] },
  divider: { height: 1, backgroundColor: colors.divider },
  tile: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.md - 2 },
  text: { flex: 1, gap: 2 },
  more: { marginTop: space[1] },
}));

/**
 * What deserves attention this month, written by the backend. The two most important are shown;
 * the rest are one tap away, so the home screen stays short.
 */
export function Insights({ insights }: InsightsProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const baseCurrency = useBaseCurrency();
  const [isExpanded, setIsExpanded] = useState(false);

  if (insights.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        {t("dashboard.insights.empty")}
      </Text>
    );
  }

  const hiddenCount = insights.length - VISIBLE_COUNT;
  const shown = isExpanded ? insights : insights.slice(0, VISIBLE_COUNT);

  return (
    <Card padding={4}>
      {shown.map((insight, index) => {
        const { icon, ink, background } = SEVERITY[insight.severity];
        return (
          <View key={insight.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.item}>
              <View style={[styles.tile, { backgroundColor: colors[background] }]} importantForAccessibility="no-hide-descendants">
                <Icon name={icon} size={18} color={colors[ink]} />
              </View>
              <View style={styles.text}>
                <Text variant="body" style={{ fontSize: 14, lineHeight: 20 }}>
                  {insight.message}
                </Text>
                {insight.amount !== null ? (
                  <Text variant="caption" color="textSecondary">
                    {/* What the amount means depends on the insight type; the value is shown as received. */}
                    {t(`dashboard.insights.amount.${insight.type}`, { amount: formatCurrency(insight.amount, baseCurrency) })}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
      {hiddenCount > 0 ? (
        <View style={styles.more}>
          <Button
            variant="ghost"
            title={isExpanded ? t("dashboard.insights.showLess") : t("dashboard.insights.showMore", { count: hiddenCount })}
            onPress={() => setIsExpanded((current) => !current)}
            accessibilityState={{ expanded: isExpanded }}
          />
        </View>
      ) : null}
    </Card>
  );
}
