import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, space } from "../theme";
import type { TransactionType } from "../types/category";
import { SegmentedControl, type SegmentedOption } from "./ui/SegmentedControl";

interface TypeToggleProps {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
}

const useStyles = makeStyles(() => ({
  wrap: { marginBottom: space[4] },
}));

/** Expense or income. Each side has a word and a direction arrow — colour is never the only signal. */
export function TypeToggle({ value, onChange }: TypeToggleProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const options: SegmentedOption<TransactionType>[] = [
    { value: "expense", label: t("common.transactionType.expense"), icon: "arrow-up-right" },
    { value: "income", label: t("common.transactionType.income"), icon: "arrow-down-left" },
  ];
  return (
    <View style={styles.wrap}>
      <SegmentedControl options={options} value={value} onChange={onChange} accessibilityLabel={t("transactions.filterGroups.type")} />
    </View>
  );
}
