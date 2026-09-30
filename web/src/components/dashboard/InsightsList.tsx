import { useState } from "react";
import type { Insight, InsightSeverity, InsightType } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { Button } from "../Button";
import { EmptyState } from "../EmptyState";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
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

// Severity is told three ways: the colour, the icon's shape, and the order (most urgent first).
const SEVERITY_ICONS: Record<InsightSeverity, IconName> = {
  alert: "alert-circle",
  warning: "alert-triangle",
  positive: "check-circle",
  info: "info",
};

/** How many insights show before "Show more": enough to see what matters without a wall of notes. */
const COLLAPSED_COUNT = 4;

interface InsightsListProps {
  insights: Insight[];
}

export function InsightsList({ insights }: InsightsListProps) {
  const baseCurrency = useBaseCurrency();
  const [isExpanded, setIsExpanded] = useState(false);

  if (insights.length === 0) {
    return (
      <EmptyState
        icon="assistant"
        message="No insights for this month yet — add some transactions to get started."
      />
    );
  }

  const hiddenCount = insights.length - COLLAPSED_COUNT;
  const visible = isExpanded ? insights : insights.slice(0, COLLAPSED_COUNT);

  return (
    <div className={styles.wrapper}>
      <ul className={styles.list}>
        {visible.map((insight) => (
          <li key={insight.id} className={`${styles.item} ${styles[insight.severity]}`}>
            <span className={styles.icon} aria-hidden="true">
              <Icon name={SEVERITY_ICONS[insight.severity]} size={18} />
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
      {hiddenCount > 0 && (
        <Button variant="ghost" size="sm" trailingIcon={isExpanded ? "chevron-up" : "chevron-down"} onClick={() => setIsExpanded((open) => !open)}>
          {isExpanded ? "Show fewer" : `Show ${hiddenCount} more`}
        </Button>
      )}
    </div>
  );
}
