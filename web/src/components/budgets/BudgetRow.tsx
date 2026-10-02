import { useTranslation } from "react-i18next";
import type { Category } from "../../types/category";
import type { BudgetStatus } from "../../types/dashboard";
import { FULL_PERCENT } from "../../config/budget";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { Badge, type BadgeTone } from "../Badge";
import { CategoryMark } from "../CategoryMark";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { ProgressBar } from "../ProgressBar";
import styles from "./BudgetRow.module.scss";

/**
 * The dashboard gets a status from the API (it knows how far into the month we are). The budgets
 * list doesn't, so it classifies by usage: "near_limit" from 80%, "over_budget" above 100%.
 */
export type BudgetRowStatus = BudgetStatus | "near_limit";

const STATUS_BADGE: Record<BudgetRowStatus, { tone: BadgeTone; icon: IconName }> = {
  on_track: { tone: "success", icon: "check" },
  ahead_of_pace: { tone: "warning", icon: "trending-up" },
  near_limit: { tone: "warning", icon: "alert-triangle" },
  over_budget: { tone: "danger", icon: "alert-circle" },
};

const BAR_TONE: Record<BudgetRowStatus, "default" | "warning" | "danger"> = {
  on_track: "default",
  ahead_of_pace: "warning",
  near_limit: "warning",
  over_budget: "danger",
};

interface BudgetRowProps {
  /** "Overall" for a budget spanning every category. */
  name: string;
  /** Undefined for the overall budget (it gets a wallet instead of a category mark). */
  category?: Pick<Category, "name" | "color">;
  /** Decimal strings, exactly as the API sent them (base currency). */
  spent: string;
  budget: string;
  remaining: string;
  /** The API's percentage; may exceed 100 — only the bar is clamped. */
  usagePercentage: number;
  status: BudgetRowStatus;
  /** How far above (+) or below (−) the limit, in % of the limit. */
  variancePercentage?: number;
  /** What the budget allows by today; draws a pace tick on the bar. */
  expectedToDate?: string;
  /** Draws the row as its own card (the Budgets page grid) instead of a bare list item. */
  card?: boolean;
}

/**
 * One budget, readable in a second: what's spent of what, how full the bar is, and what's left.
 * Shared by the dashboard and the Budgets page, so a budget looks the same in both.
 */
export function BudgetRow({
  name,
  category,
  spent,
  budget,
  remaining,
  usagePercentage,
  status,
  variancePercentage,
  expectedToDate,
  card = false,
}: BudgetRowProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  const badge = STATUS_BADGE[status];
  const isOver = Number(remaining) < 0;
  // Only the tick's position needs a number; nothing derived is shown.
  const pacePosition = expectedToDate !== undefined && Number(budget) > 0 ? (Number(expectedToDate) / Number(budget)) * FULL_PERCENT : undefined;

  return (
    <li className={card ? `${styles.row} ${styles.card}` : styles.row}>
      <div className={styles.header}>
        {category ? (
          <CategoryMark category={category} size="md" />
        ) : (
          <span className={styles.overall} aria-hidden="true">
            <Icon name="wallet" size={18} />
          </span>
        )}
        <div className={styles.title}>
          <span className={styles.name}>{name}</span>
          <span className={styles.amounts}>
            {t("budgets.row.amounts", { spent: formatCurrency(spent, baseCurrency), budget: formatCurrency(budget, baseCurrency) })}
          </span>
        </div>
        <Badge tone={badge.tone} icon={badge.icon}>
          {t(`budgets.status.${status}`)}
        </Badge>
      </div>

      <ProgressBar
        percentage={usagePercentage}
        label={t("budgets.row.used", { name })}
        tone={BAR_TONE[status]}
        marker={pacePosition}
      />

      <div className={styles.footer}>
        <span className={isOver ? `${styles.remaining} ${styles.over}` : styles.remaining}>
          {isOver
            ? t("budgets.row.over", { amount: formatCurrency(Math.abs(Number(remaining)), baseCurrency) })
            : t("budgets.row.left", { amount: formatCurrency(remaining, baseCurrency) })}
        </span>
        <span className={styles.usage}>
          {variancePercentage === undefined
            ? t("budgets.row.usage", { percentage: formatPercentage(usagePercentage) })
            : variancePercentage > 0
              ? t("budgets.row.overBudget", { percentage: formatPercentage(variancePercentage) })
              : t("budgets.row.underBudget", { percentage: formatPercentage(Math.abs(variancePercentage)) })}
        </span>
      </div>
    </li>
  );
}
