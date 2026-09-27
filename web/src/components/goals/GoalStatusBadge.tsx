import type { SavingsGoalStatus } from "../../types/savingsGoal";
import { GOAL_STATUS_LABELS } from "../../utils/savingsGoals";
import styles from "./GoalStatusBadge.module.scss";

export function GoalStatusBadge({ status }: { status: SavingsGoalStatus }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{GOAL_STATUS_LABELS[status]}</span>;
}
