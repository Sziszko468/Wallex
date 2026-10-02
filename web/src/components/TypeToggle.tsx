import { useTranslation } from "react-i18next";
import type { TransactionType } from "../types/category";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

interface TypeToggleProps {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
}

export function TypeToggle({ value, onChange }: TypeToggleProps) {
  const { t } = useTranslation();
  // Each option carries an icon as well as its colour: money leaving vs. arriving.
  const options: readonly SegmentedOption<TransactionType>[] = [
    { value: "expense", label: t("common.transactionType.expense"), icon: "arrow-up-right", tone: "expense" },
    { value: "income", label: t("common.transactionType.income"), icon: "arrow-down-left", tone: "income" },
  ];
  return <SegmentedControl options={options} value={value} onChange={onChange} label={t("common.transactionType.label")} fullWidth />;
}
