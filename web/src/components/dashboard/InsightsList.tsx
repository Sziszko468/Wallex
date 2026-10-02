import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Insight, InsightSeverity } from "../../types/dashboard";
import { formatCurrency } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { Button } from "../Button";
import { EmptyState } from "../EmptyState";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import styles from "./InsightsList.module.scss";

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
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  const [isExpanded, setIsExpanded] = useState(false);

  if (insights.length === 0) {
    return <EmptyState icon="assistant" message={t("dashboard.insights.empty")} />;
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
                  {/* What the amount means depends on the insight type; the value is shown as received. */}
                  {t(`dashboard.insights.amount.${insight.type}`, { amount: formatCurrency(insight.amount, baseCurrency) })}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <Button variant="ghost" size="sm" trailingIcon={isExpanded ? "chevron-up" : "chevron-down"} onClick={() => setIsExpanded((open) => !open)}>
          {isExpanded ? t("dashboard.insights.showFewer") : t("dashboard.insights.showMore", { count: hiddenCount })}
        </Button>
      )}
    </div>
  );
}
