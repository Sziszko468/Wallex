import { useTranslation } from "react-i18next";
import type { AssistantInsight, AssistantInsightType } from "../../types/assistant";
import type { CurrencyCode } from "../../types/currency";
import { formatCurrency, formatPercentage, formatSignedPercentage } from "../../utils/format";
import { Badge, type BadgeTone } from "../Badge";
import { Icon } from "../icons/Icon";
import styles from "./InsightCards.module.scss";

/** Cards whose percentage is a change against an earlier period (signed, with an arrow). */
const CHANGE_TYPES = new Set<AssistantInsightType>(["spending_change", "spending_change_year", "biggest_increase"]);

const TONE_BADGE: Record<AssistantInsight["tone"], BadgeTone> = {
  neutral: "neutral",
  positive: "success",
  warning: "danger",
};

/** "+€165.20" for an increase: the sign says which way it went. */
function formatAmount(insight: AssistantInsight, amount: string, currency: CurrencyCode): string {
  const formatted = formatCurrency(amount, currency);
  return CHANGE_TYPES.has(insight.type) && Number(amount) > 0 ? `+${formatted}` : formatted;
}

function Percentage({ insight, percentage }: { insight: AssistantInsight; percentage: number }) {
  const { t } = useTranslation();
  if (CHANGE_TYPES.has(insight.type)) {
    return (
      <Badge tone={TONE_BADGE[insight.tone]} icon={percentage > 0 ? "arrow-up" : percentage < 0 ? "arrow-down" : undefined}>
        {formatSignedPercentage(percentage)}
      </Badge>
    );
  }
  return (
    <span className={styles.percentage}>
      {formatPercentage(percentage)} {t(`assistant.insights.meaning.${insight.type}`)}
    </span>
  );
}

function InsightCard({ insight }: { insight: AssistantInsight }) {
  const { t } = useTranslation();
  const { amount, currency, percentage } = insight;
  return (
    <li className={`${styles.card} ${styles[insight.tone]}`}>
      <p className={styles.label}>
        {insight.tone !== "neutral" && (
          <>
            <Icon name={insight.tone === "warning" ? "alert-triangle" : "check-circle"} size={14} />
            <span className={styles.visuallyHidden}>{t(`assistant.insights.tone.${insight.tone}`)}: </span>
          </>
        )}
        {insight.label}
      </p>
      {insight.detail && <p className={styles.detail}>{insight.detail}</p>}
      <p className={styles.value}>
        {amount !== null && currency !== null && <span className={styles.amount}>{formatAmount(insight, amount, currency)}</span>}
        {percentage !== null && <Percentage insight={insight} percentage={percentage} />}
      </p>
    </li>
  );
}

/** The key figures behind an answer, computed by the backend — not written by the model. */
export function InsightCards({ insights }: { insights: AssistantInsight[] }) {
  const { t } = useTranslation();
  if (insights.length === 0) return null;
  return (
    <ul className={styles.cards} aria-label={t("assistant.messages.insights")}>
      {insights.map((insight, index) => (
        <InsightCard key={`${insight.type}-${index}`} insight={insight} />
      ))}
    </ul>
  );
}
