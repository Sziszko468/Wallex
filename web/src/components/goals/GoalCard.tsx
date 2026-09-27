import { Link } from "react-router-dom";
import type { SavingsGoal } from "../../types/savingsGoal";
import { formatCurrency, formatDate, formatPercentage } from "../../utils/format";
import { describeDaysLeft, goalTone } from "../../utils/savingsGoals";
import { GoalStatusBadge } from "./GoalStatusBadge";
import { ProgressBar } from "../ProgressBar";
import styles from "./GoalCard.module.scss";

interface GoalCardProps {
  goal: SavingsGoal;
  onAddMoney: (goal: SavingsGoal) => void;
  onRemoveMoney: (goal: SavingsGoal) => void;
  onEdit: (goal: SavingsGoal) => void;
  onDelete: (goal: SavingsGoal) => void;
}

/** One goal in the list: progress as the API computed it, target date, and quick actions. */
export function GoalCard({ goal, onAddMoney, onRemoveMoney, onEdit, onDelete }: GoalCardProps) {
  const isArchived = goal.status === "archived";

  return (
    <article className={`${styles.card} ${isArchived ? styles.archived : ""}`} aria-label={goal.name}>
      <header className={styles.header}>
        <Link to={`/goals/${goal.id}`} className={styles.name}>
          {goal.name}
        </Link>
        <GoalStatusBadge status={goal.status} />
      </header>

      <div className={styles.amounts}>
        <span className={styles.saved}>{formatCurrency(goal.current_amount, goal.currency)}</span>
        <span className={styles.target}> of {formatCurrency(goal.target_amount, goal.currency)}</span>
      </div>

      <ProgressBar
        percentage={goal.progress_percentage}
        label={`${goal.name} progress`}
        tone={goalTone(goal.status)}
      />

      <div className={styles.meta}>
        <span className={styles.percentage}>{formatPercentage(goal.progress_percentage)}</span>
        {goal.target_date && goal.days_left !== null ? (
          <span className={goal.days_left < 0 && goal.status === "active" ? styles.overdue : undefined}>
            {formatDate(goal.target_date)} · {describeDaysLeft(goal.days_left)}
          </span>
        ) : (
          <span>No target date</span>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => onAddMoney(goal)}
          disabled={isArchived}
          aria-label={`Add money to ${goal.name}`}
        >
          + Add money
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={() => onRemoveMoney(goal)}
          disabled={isArchived}
          aria-label={`Remove money from ${goal.name}`}
        >
          − Remove
        </button>
        <button type="button" className={styles.action} onClick={() => onEdit(goal)} aria-label={`Edit ${goal.name}`}>
          Edit
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.delete}`}
          onClick={() => onDelete(goal)}
          aria-label={`Delete ${goal.name}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
