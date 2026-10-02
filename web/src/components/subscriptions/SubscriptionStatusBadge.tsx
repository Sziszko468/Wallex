import type { SubscriptionStatus } from "../../types/subscription";
import { statusLabel } from "../../utils/subscriptions";
import { Badge, type BadgeTone } from "../Badge";
import type { IconName } from "../icons/iconPaths";

const STATUS_STYLE: Record<SubscriptionStatus, { tone: BadgeTone; icon: IconName; outline: boolean }> = {
  active: { tone: "success", icon: "check", outline: false },
  paused: { tone: "neutral", icon: "pause", outline: true },
  ended: { tone: "warning", icon: "clock", outline: false },
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <Badge tone={style.tone} icon={style.icon} variant={style.outline ? "outline" : "soft"}>
      {statusLabel(status)}
    </Badge>
  );
}
