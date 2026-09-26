import type { Insight, InsightSeverity, InsightType } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { EmptyState } from "../EmptyState";
import styles from "./InsightsList.module.scss";

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

const SEVERITY_ICONS: Record<InsightSeverity, string> = {
  alert: "!",
  warning: "▲",
  positive: "✓",
  info: "i",
};

interface InsightsListProps {
  insights: Insight[];
}

export function InsightsList({ insights }: InsightsListProps) {
  const baseCurrency = useBaseCurrency();
  if (insights.length === 0) {
    return <EmptyState message="No insights for this month yet — add some transactions to get started." />;
  }

  return (
    <ul className={styles.list}>
      {insights.map((insight) => (
        <li key={insight.id} className={`${styles.item} ${styles[insight.severity]}`}>
          <span className={styles.icon} aria-hidden="true">
            {SEVERITY_ICONS[insight.severity]}
          </span>
          <div className={styles.text}>
            <p className={styles.message}>{insight.message}</p>
            {insight.amount !== null && (
              <p className={styles.detail}>
                {formatCurrency(insight.amount, baseCurrency)} {AMOUNT_LABELS[insight.type]}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
