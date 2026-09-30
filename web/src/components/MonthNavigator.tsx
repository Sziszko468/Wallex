import { formatMonthYear } from "../utils/format";
import { IconButton } from "./IconButton";
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
      <IconButton icon="chevron-left" label="Previous month" variant="outline" onClick={goToPreviousMonth} />
      <span className={styles.label} aria-live="polite">
        {formatMonthYear(year, month)}
      </span>
      <IconButton icon="chevron-right" label="Next month" variant="outline" onClick={goToNextMonth} />
    </div>
  );
}
