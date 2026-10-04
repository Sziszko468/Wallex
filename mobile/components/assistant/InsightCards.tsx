import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, radius, space, useTheme } from "../../theme";
import type { AssistantInsight, AssistantInsightType } from "../../types/assistant";
import type { CurrencyCode } from "../../types/currency";
import { formatCurrency, formatPercentage, formatSignedPercentage } from "../../utils/format";
import { Icon } from "../icons/Icon";
import { Text } from "../ui/Text";

/** Cards whose percentage is a change against an earlier period (signed). */
const CHANGE_TYPES = new Set<AssistantInsightType>(["spending_change", "spending_change_year", "biggest_increase"]);

const STRIPE_WIDTH = 3;

const useStyles = makeStyles(({ colors }) => ({
  cards: { gap: space[2], alignSelf: "stretch" },
  card: {
    gap: space[1],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: STRIPE_WIDTH,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  warning: { borderLeftColor: colors.warning },
  positive: { borderLeftColor: colors.success },
  label: { flexDirection: "row", alignItems: "center", gap: space[1] },
  value: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: space[2] },
}));

/** "+€165.20" for an increase: the sign says which way it went. */
function formatAmount(insight: AssistantInsight, amount: string, currency: CurrencyCode): string {
  const formatted = formatCurrency(amount, currency);
  return CHANGE_TYPES.has(insight.type) && Number(amount) > 0 ? `+${formatted}` : formatted;
}

function InsightCard({ insight }: { insight: AssistantInsight }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const { amount, currency, percentage, tone } = insight;

  const percentageText =
    percentage === null
      ? null
      : CHANGE_TYPES.has(insight.type)
        ? formatSignedPercentage(percentage)
        : `${formatPercentage(percentage)} ${t(`assistant.insights.meaning.${insight.type}`)}`;
  const toneText = tone === "neutral" ? null : t(`assistant.insights.tone.${tone}`);
  const spoken = [toneText, insight.label, insight.detail, amount !== null && currency !== null ? formatAmount(insight, amount, currency) : null, percentageText]
    .filter(Boolean)
    .join(", ");

  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={[styles.card, tone === "warning" && styles.warning, tone === "positive" && styles.positive]}
    >
      <View style={styles.label}>
        {tone !== "neutral" ? (
          <Icon
            name={tone === "warning" ? "alert-triangle" : "check-circle"}
            size={14}
            color={tone === "warning" ? colors.warning : colors.success}
          />
        ) : null}
        <Text variant="small" color="textSecondary">
          {insight.label}
        </Text>
      </View>
      {insight.detail ? <Text variant="body">{insight.detail}</Text> : null}
      <View style={styles.value}>
        {amount !== null && currency !== null ? <Text variant="amountLarge">{formatAmount(insight, amount, currency)}</Text> : null}
        {percentageText !== null ? (
          <Text variant="small" color={tone === "warning" ? "warning" : tone === "positive" ? "success" : "textSecondary"}>
            {percentageText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The key figures behind an answer, computed by the backend — not written by the model. */
export function InsightCards({ insights }: { insights: AssistantInsight[] }) {
  const { t } = useTranslation();
  const styles = useStyles();
  if (insights.length === 0) return null;
  return (
    <View style={styles.cards} accessibilityLabel={t("assistant.messages.insights")}>
      {insights.map((insight, index) => (
        <InsightCard key={`${insight.type}-${index}`} insight={insight} />
      ))}
    </View>
  );
}
