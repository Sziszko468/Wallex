import { useTranslation } from "react-i18next";
import { MONTHS_PER_YEAR } from "../config/calendar";
import { formatMonthYear } from "../utils/format";
import { IconButton } from "./IconButton";
import styles from "./MonthNavigator.module.scss";

interface MonthNavigatorProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

export function MonthNavigator({ year, month, onChange }: MonthNavigatorProps) {
  const { t } = useTranslation();

  function goToPreviousMonth() {
    if (month === 1) onChange(year - 1, MONTHS_PER_YEAR);
    else onChange(year, month - 1);
  }

  function goToNextMonth() {
    if (month === MONTHS_PER_YEAR) onChange(year + 1, 1);
    else onChange(year, month + 1);
  }

  return (
    <div className={styles.navigator}>
      <IconButton icon="chevron-left" label={t("common.month.previous")} variant="outline" onClick={goToPreviousMonth} />
      <span className={styles.label} aria-live="polite">
        {formatMonthYear(year, month)}
      </span>
      <IconButton icon="chevron-right" label={t("common.month.next")} variant="outline" onClick={goToNextMonth} />
    </div>
  );
}
