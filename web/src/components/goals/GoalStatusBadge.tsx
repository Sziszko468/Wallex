import type { SavingsGoalStatus } from "../../types/savingsGoal";
import { GOAL_STATUS_LABELS } from "../../utils/savingsGoals";
import { Badge, type BadgeTone } from "../Badge";
import type { IconName } from "../icons/iconPaths";

const STATUS_STYLE: Record<SavingsGoalStatus, { tone: BadgeTone; icon: IconName; outline: boolean }> = {
  active: { tone: "savings", icon: "goals", outline: false },
  completed: { tone: "success", icon: "check", outline: false },
  archived: { tone: "neutral", icon: "file", outline: true },
};

export function GoalStatusBadge({ status }: { status: SavingsGoalStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <Badge tone={style.tone} icon={style.icon} variant={style.outline ? "outline" : "soft"}>
      {GOAL_STATUS_LABELS[status]}
    </Badge>
  );
}
