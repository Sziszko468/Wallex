import { useTranslation } from "react-i18next";
import type { RecurringFrequency } from "../../types/recurringTransaction";
import { SegmentedControl, type SegmentedOption } from "../ui/SegmentedControl";

const FREQUENCIES: readonly RecurringFrequency[] = ["weekly", "monthly", "yearly"];

interface FrequencyPickerProps {
  value: RecurringFrequency;
  onChange: (frequency: RecurringFrequency) => void;
}

/** How often it repeats: weekly, monthly or yearly. */
export function FrequencyPicker({ value, onChange }: FrequencyPickerProps) {
  const { t } = useTranslation();
  const options: SegmentedOption<RecurringFrequency>[] = FREQUENCIES.map((frequency) => ({
    value: frequency,
    label: t(`recurring.frequency.${frequency}`),
  }));
  return <SegmentedControl options={options} value={value} onChange={onChange} accessibilityLabel={t("recurring.form.frequency")} />;
}
