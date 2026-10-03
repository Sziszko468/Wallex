import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { DATE_PRESETS, type DatePreset } from "../../config/transactions";
import { makeStyles, space, useTheme } from "../../theme";
import type { Category, TransactionType } from "../../types/category";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { SegmentedControl, type SegmentedOption } from "../ui/SegmentedControl";
import { Text } from "../ui/Text";
import { categoryLook } from "../../utils/categoryStyle";

export type TypeFilter = TransactionType | "all";

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  categories: Category[];
  type: TypeFilter;
  onTypeChange: (type: TypeFilter) => void;
  categoryId: number | null;
  onCategoryChange: (id: number | null) => void;
  datePreset: DatePreset;
  onDatePresetChange: (preset: DatePreset) => void;
  /** Resets everything; only offered while some filter is on. */
  onClear: () => void;
  hasActiveFilters: boolean;
}

const useStyles = makeStyles(() => ({
  group: { gap: space[3], marginBottom: space[5] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  footer: { flexDirection: "row", gap: space[3] },
  footerButton: { flex: 1 },
}));

/**
 * The transactions filters in a bottom sheet: type, category, date. Changes apply as they are
 * made — the list behind the sheet updates — so there is nothing to confirm; "Done" just closes.
 */
export function FilterSheet({
  visible,
  onClose,
  categories,
  type,
  onTypeChange,
  categoryId,
  onCategoryChange,
  datePreset,
  onDatePresetChange,
  onClear,
  hasActiveFilters,
}: FilterSheetProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { scheme } = useTheme();

  const typeOptions: SegmentedOption<TypeFilter>[] = [
    { value: "all", label: t("transactions.types.all") },
    { value: "expense", label: t("common.transactionType.expense"), icon: "arrow-up-right" },
    { value: "income", label: t("common.transactionType.income"), icon: "arrow-down-left" },
  ];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t("transactions.filters")}
      footer={
        <View style={styles.footer}>
          {hasActiveFilters ? (
            <View style={styles.footerButton}>
              <Button title={t("transactions.clearFilters")} variant="secondary" onPress={onClear} />
            </View>
          ) : null}
          <View style={styles.footerButton}>
            <Button title={t("common.actions.done")} onPress={onClose} />
          </View>
        </View>
      }
    >
      <View style={styles.group}>
        <Text variant="label" color="textSecondary">
          {t("transactions.filterGroups.type")}
        </Text>
        <SegmentedControl options={typeOptions} value={type} onChange={onTypeChange} accessibilityLabel={t("transactions.filterGroups.type")} />
      </View>

      <View style={styles.group}>
        <Text variant="label" color="textSecondary">
          {t("transactions.filterGroups.category")}
        </Text>
        <View style={styles.chips}>
          <Chip label={t("transactions.allCategories")} isSelected={categoryId === null} onPress={() => onCategoryChange(null)} />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              dotColor={categoryLook(category.color, scheme).tone}
              isSelected={categoryId === category.id}
              onPress={() => onCategoryChange(category.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <Text variant="label" color="textSecondary">
          {t("transactions.filterGroups.date")}
        </Text>
        <View style={styles.chips}>
          {DATE_PRESETS.map((preset) => (
            <Chip key={preset} label={t(`transactions.presets.${preset}`)} isSelected={datePreset === preset} onPress={() => onDatePresetChange(preset)} />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}
