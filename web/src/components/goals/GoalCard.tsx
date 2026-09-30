import { Link } from "react-router-dom";
import type { SavingsGoal } from "../../types/savingsGoal";
import { formatCurrency, formatDate, formatPercentage } from "../../utils/format";
import { describeDaysLeft, goalTone } from "../../utils/savingsGoals";
import { Button } from "../Button";
import { IconButton } from "../IconButton";
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
  const isOverdue = goal.days_left !== null && goal.days_left < 0 && goal.status === "active";

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

      <div className={styles.progress}>
        <ProgressBar percentage={goal.progress_percentage} label={`${goal.name} progress`} tone={goalTone(goal.status)} />
        <div className={styles.meta}>
          <span className={styles.percentage}>{formatPercentage(goal.progress_percentage)}</span>
          {goal.target_date && goal.days_left !== null ? (
            <span className={isOverdue ? styles.overdue : undefined}>
              {formatDate(goal.target_date)} · {describeDaysLeft(goal.days_left)}
            </span>
          ) : (
            <span>No target date</span>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="sm"
          leadingIcon="plus"
          disabled={isArchived}
          aria-label={`Add money to ${goal.name}`}
          onClick={() => onAddMoney(goal)}
        >
          Add money
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon="minus"
          disabled={isArchived}
          aria-label={`Remove money from ${goal.name}`}
          onClick={() => onRemoveMoney(goal)}
        >
          Remove
        </Button>
        <span className={styles.spacer} />
        <IconButton icon="pencil" label={`Edit ${goal.name}`} size="sm" onClick={() => onEdit(goal)} />
        <IconButton icon="trash" label={`Delete ${goal.name}`} variant="danger" size="sm" onClick={() => onDelete(goal)} />
      </div>
    </article>
  );
}
