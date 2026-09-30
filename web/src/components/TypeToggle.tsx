import type { TransactionType } from "../types/category";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

interface TypeToggleProps {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
}

// Each option carries an icon as well as its colour: money leaving vs. arriving.
const OPTIONS: readonly SegmentedOption<TransactionType>[] = [
  { value: "expense", label: "Expense", icon: "arrow-up-right", tone: "expense" },
  { value: "income", label: "Income", icon: "arrow-down-left", tone: "income" },
];

export function TypeToggle({ value, onChange }: TypeToggleProps) {
  return <SegmentedControl options={OPTIONS} value={value} onChange={onChange} label="Transaction type" fullWidth />;
}
