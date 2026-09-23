import { formatMonthYear } from "../../utils/format";
import styles from "./MonthNavigator.module.scss";

interface MonthNavigatorProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

export function MonthNavigator({ year, month, onChange }: MonthNavigatorProps) {
  function goToPreviousMonth() {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  }

  function goToNextMonth() {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  }

  return (
    <div className={styles.navigator}>
      <button
        type="button"
        className={styles.navButton}
        onClick={goToPreviousMonth}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className={styles.label}>{formatMonthYear(year, month)}</span>
      <button
        type="button"
        className={styles.navButton}
        onClick={goToNextMonth}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
