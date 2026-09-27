import { Link } from "react-router-dom";
import type { SavingsGoal, SavingsSummary } from "../../types/savingsGoal";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { goalTone } from "../../utils/savingsGoals";
import { EmptyState } from "../EmptyState";
import { ProgressBar } from "../ProgressBar";
import styles from "./SavingsProgress.module.scss";

const GOALS_SHOWN = 3;

interface SavingsProgressProps {
  summary: SavingsSummary;
  /** In the API's order: active goals first, nearest target date first. */
  goals: SavingsGoal[];
}

/** Overall savings progress (base currency) and the first few goals — all figures from the API. */
export function SavingsProgress({ summary, goals }: SavingsProgressProps) {
  const shown = goals.filter((goal) => goal.status !== "archived").slice(0, GOALS_SHOWN);
  if (shown.length === 0) {
    return (
      <div className={styles.empty}>
        <EmptyState message="No savings goals yet." />
        <Link to="/goals" className={styles.link}>
          Create a goal →
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.overview}>
      <div className={styles.total}>
        <div className={styles.totalHeader}>
          <span>
            <strong>{formatCurrency(summary.total_saved, summary.currency)}</strong> saved of{" "}
            {formatCurrency(summary.total_target, summary.currency)}
          </span>
          {summary.progress_percentage !== null && (
            <span className={styles.percentage}>{formatPercentage(summary.progress_percentage)}</span>
          )}
        </div>
        {summary.progress_percentage !== null && (
          <ProgressBar percentage={summary.progress_percentage} label="Overall savings progress" size="large" />
        )}
      </div>

      <ul className={styles.list}>
        {shown.map((goal) => (
          <li key={goal.id} className={styles.item}>
            <div className={styles.itemHeader}>
              <Link to={`/goals/${goal.id}`} className={styles.name}>
                {goal.name}
              </Link>
              <span className={styles.meta}>
                {formatCurrency(goal.current_amount, goal.currency)} / {formatCurrency(goal.target_amount, goal.currency)}
                {" · "}
                {formatPercentage(goal.progress_percentage)}
              </span>
            </div>
            <ProgressBar percentage={goal.progress_percentage} label={`${goal.name} progress`} tone={goalTone(goal.status)} />
          </li>
        ))}
      </ul>

      <div className={styles.footer}>
        <span className={styles.meta}>
          {summary.active_count} active · {summary.completed_count} completed
          {summary.unconverted_currencies.length > 0 &&
            ` · ${summary.unconverted_currencies.join(", ")} not included (no exchange rate)`}
        </span>
        <Link to="/goals" className={styles.link}>
          All goals →
        </Link>
      </div>
    </div>
  );
}
