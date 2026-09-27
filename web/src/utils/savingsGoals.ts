import type { SavingsGoalStatus } from "../types/savingsGoal";

export const GOAL_STATUS_LABELS: Record<SavingsGoalStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

/** Progress-bar colour for a goal's status. */
export function goalTone(status: SavingsGoalStatus): "default" | "complete" | "muted" {
  if (status === "completed") return "complete";
  return status === "archived" ? "muted" : "default";
}

/** "186 days left", "Due today", "12 days overdue" — from the API's days_left. */
export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return "Due today";
  if (daysLeft > 0) return `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
  const overdue = Math.abs(daysLeft);
  return `${overdue} ${overdue === 1 ? "day" : "days"} overdue`;
}
