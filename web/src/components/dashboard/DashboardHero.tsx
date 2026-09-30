import type { DashboardStats } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatMonthYear } from "../../utils/format";
import { ButtonLink } from "../ButtonLink";
import { Card } from "../Card";
import { Icon } from "../icons/Icon";
import { Skeleton } from "../Skeleton";
import { ProgressBar } from "../ProgressBar";
import styles from "./DashboardHero.module.scss";

interface DashboardHeroProps {
  stats: DashboardStats | null;
  year: number;
  month: number;
  isLoading: boolean;
}

/**
 * The first thing on the dashboard: one clear answer to "how am I doing this month?".
 * The balance leads; income and spending support it as two proportional strokes. Every figure
 * is the backend's; the bars only compare the two values visually (nothing is computed or shown).
 */
export function DashboardHero({ stats, year, month, isLoading }: DashboardHeroProps) {
  const baseCurrency = useBaseCurrency();

  if (isLoading || !stats) {
    return (
      <Card tone="tinted" padding="lg" aria-busy="true" aria-label="Loading your overview">
        <div className={styles.skeleton}>
          <Skeleton width="9rem" height="0.875rem" />
          <Skeleton width="min(18rem, 70%)" height="3.25rem" borderRadius={12} />
          <Skeleton height="4.5rem" borderRadius={14} />
        </div>
      </Card>
    );
  }

  const balanceIsNegative = Number(stats.balance) < 0;
  const income = Number(stats.total_income);
  const expenses = Number(stats.total_expenses);
  const scale = Math.max(income, expenses);
  const incomeWidth = scale > 0 ? (income / scale) * 100 : 0;
  const expensesWidth = scale > 0 ? (expenses / scale) * 100 : 0;
  const overallBudget = stats.budget_usage.find((budget) => budget.category_id === null);
  const overallRemaining = overallBudget ? Number(overallBudget.remaining_amount) : 0;

  return (
    <Card as="section" tone="tinted" padding="lg" aria-label="Overview">
      <div className={styles.hero}>
        <div className={styles.primary}>
          <p className={styles.overline}>
            Balance · {formatMonthYear(year, month)}
          </p>
          <p className={balanceIsNegative ? `${styles.balance} ${styles.negative}` : styles.balance}>
            {formatCurrency(stats.balance, baseCurrency)}
          </p>
          <p className={styles.caption}>
            {balanceIsNegative ? "You spent more than you earned this month." : "What's left after this month's spending."}
          </p>
        </div>

        <dl className={styles.flows}>
          <div className={styles.flow}>
            <dt className={styles.flowLabel}>
              <span className={`${styles.flowIcon} ${styles.incomeIcon}`}>
                <Icon name="arrow-down-left" size={14} strokeWidth={2.25} />
              </span>
              Income
            </dt>
            <dd className={styles.flowValue}>
              <span className={styles.amount}>
                +{formatCurrency(stats.total_income, baseCurrency)}
              </span>
              <span className={styles.bar} aria-hidden="true">
                <span className={`${styles.fill} ${styles.incomeFill}`} style={{ width: `${incomeWidth}%` }} />
              </span>
            </dd>
          </div>
          <div className={styles.flow}>
            <dt className={styles.flowLabel}>
              <span className={`${styles.flowIcon} ${styles.expenseIcon}`}>
                <Icon name="arrow-up-right" size={14} strokeWidth={2.25} />
              </span>
              Expenses
            </dt>
            <dd className={styles.flowValue}>
              <span className={styles.amount}>
                −{formatCurrency(stats.total_expenses, baseCurrency)}
              </span>
              <span className={styles.bar} aria-hidden="true">
                <span className={`${styles.fill} ${styles.expenseFill}`} style={{ width: `${expensesWidth}%` }} />
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className={styles.facts}>
        <p className={styles.fact}>
          <Icon name="transactions" size={16} />
          {stats.transaction_count} {stats.transaction_count === 1 ? "transaction" : "transactions"} this month
        </p>
        {stats.top_spending_category && (
          <p className={styles.fact}>
            <Icon name="budgets" size={16} />
            Most spent on {stats.top_spending_category.category_name}
          </p>
        )}
        {stats.transaction_count === 0 && (
          <ButtonLink to="/transactions" size="sm" leadingIcon="plus">
            Add a transaction
          </ButtonLink>
        )}
        {overallBudget && (
          <div className={styles.budget}>
            <p className={styles.fact}>
              <Icon name="wallet" size={16} />
              Overall budget:{" "}
              {overallRemaining < 0
                ? `${formatCurrency(Math.abs(overallRemaining), baseCurrency)} over`
                : `${formatCurrency(overallBudget.remaining_amount, baseCurrency)} left`}
            </p>
            <ProgressBar
              percentage={overallBudget.usage_percentage}
              label="Overall budget used"
              tone={overallBudget.status === "over_budget" ? "danger" : overallBudget.status === "ahead_of_pace" ? "warning" : "default"}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
