import type { SubscriptionStatus } from "../../types/subscription";
import { STATUS_LABELS } from "../../utils/subscriptions";
import styles from "./SubscriptionStatusBadge.module.scss";

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{STATUS_LABELS[status]}</span>;
}
