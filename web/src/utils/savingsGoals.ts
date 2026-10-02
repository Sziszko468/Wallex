import { t } from "i18next";
import type { SavingsGoalStatus } from "../types/savingsGoal";

/** "Active" / "Completed" / "Archived". */
export function goalStatusLabel(status: SavingsGoalStatus): string {
  return t(`goals.status.${status}`);
}

/** Progress-bar colour for a goal's status. */
export function goalTone(status: SavingsGoalStatus): "default" | "complete" | "muted" {
  if (status === "completed") return "complete";
  return status === "archived" ? "muted" : "default";
}

/** "186 days left", "Due today", "12 days overdue" — from the API's days_left. */
export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return t("goals.daysLeft.today");
  if (daysLeft > 0) return t("goals.daysLeft.left", { count: daysLeft });
  return t("goals.daysLeft.overdue", { count: Math.abs(daysLeft) });
}
