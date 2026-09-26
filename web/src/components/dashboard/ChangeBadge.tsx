import { formatSignedPercentage } from "../../utils/format";
import styles from "./ChangeBadge.module.scss";

interface ChangeBadgeProps {
  /** Percentage change computed by the API; null when there was nothing to compare with. */
  value: number | null;
  /** For spending, a decrease is the good direction (green); for income, an increase. */
  goodWhen?: "down" | "up";
}

export function ChangeBadge({ value, goodWhen = "down" }: ChangeBadgeProps) {
  if (value === null) {
    return <span className={`${styles.badge} ${styles.neutral}`}>new</span>;
  }
  const isGood = value === 0 ? null : (value < 0) === (goodWhen === "down");
  const tone = isGood === null ? styles.neutral : isGood ? styles.good : styles.bad;
  return <span className={`${styles.badge} ${tone}`}>{formatSignedPercentage(value)}</span>;
}
