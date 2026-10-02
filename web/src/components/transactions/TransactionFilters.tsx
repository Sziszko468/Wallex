import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Category } from "../../types/category";
import type { TransactionType } from "../../types/category";
import { Button } from "../Button";
import { SegmentedControl, type SegmentedOption } from "../SegmentedControl";
import { Select } from "../Select";
import { TextField } from "../TextField";
import styles from "./TransactionFilters.module.scss";

export interface TransactionFiltersValue {
  search: string;
  type: TransactionType | "";
  category: string;
  dateFrom: string;
  dateTo: string;
}

export const emptyTransactionFilters: TransactionFiltersValue = {
  search: "",
  type: "",
  category: "",
  dateFrom: "",
  dateTo: "",
};

type TypeFilter = TransactionType | "all";

interface TransactionFiltersProps {
  value: TransactionFiltersValue;
  categories: Category[];
  ordering: string;
  onChange: (value: TransactionFiltersValue) => void;
  onOrderingChange: (ordering: string) => void;
}

export function TransactionFilters({ value, categories, ordering, onChange, onOrderingChange }: TransactionFiltersProps) {
  const { t } = useTranslation();
  const typeOptions: readonly SegmentedOption<TypeFilter>[] = [
    { value: "all", label: t("transactions.filters.all") },
    { value: "expense", label: t("transactions.filters.expenses") },
    { value: "income", label: t("transactions.filters.income") },
  ];
  // The API sorts amounts by base_amount — their value in one currency — so 15,000 HUF ranks below 50 EUR.
  const sortOptions = [
    { value: "-date", label: t("transactions.filters.sort.newest") },
    { value: "date", label: t("transactions.filters.sort.oldest") },
    { value: "-base_amount", label: t("transactions.filters.sort.highest") },
    { value: "base_amount", label: t("transactions.filters.sort.lowest") },
  ];
  const panelId = useId();
  // On phones the secondary filters fold away behind a "Filters" button; wider screens show them all.
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  function update<K extends keyof TransactionFiltersValue>(key: K, fieldValue: TransactionFiltersValue[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  const hasActiveFilters = Object.values(value).some(Boolean);
  const activeSecondaryCount = [value.category, value.dateFrom, value.dateTo].filter(Boolean).length;

  return (
    <div className={styles.filters} role="search" aria-label={t("transactions.filters.label")}>
      <div className={styles.primary}>
        <TextField
          label={t("transactions.filters.search")}
          hideLabel
          type="search"
          leadingIcon="search"
          placeholder={t("transactions.filters.searchPlaceholder")}
          value={value.search}
          onChange={(event) => update("search", event.target.value)}
          className={styles.search}
        />
        <Button
          variant="secondary"
          leadingIcon="filter"
          className={styles.toggle}
          aria-expanded={isPanelOpen}
          aria-controls={panelId}
          onClick={() => setIsPanelOpen((open) => !open)}
        >
          {activeSecondaryCount > 0 ? t("transactions.filters.toggleActive", { count: activeSecondaryCount }) : t("transactions.filters.toggle")}
        </Button>
        <div className={styles.type}>
          <SegmentedControl
            options={typeOptions}
            value={value.type === "" ? "all" : value.type}
            onChange={(next) => update("type", next === "all" ? "" : next)}
            label={t("common.transactionType.label")}
            fullWidth
          />
        </div>
      </div>

      <div id={panelId} className={isPanelOpen ? `${styles.panel} ${styles.panelOpen}` : styles.panel}>
        <Select
          label={t("common.form.category")}
          placeholder={t("transactions.filters.allCategories")}
          value={value.category}
          onChange={(event) => update("category", event.target.value)}
          options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
          className={styles.category}
        />
        <TextField label={t("transactions.filters.from")} type="date" value={value.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} />
        <TextField label={t("transactions.filters.to")} type="date" value={value.dateTo} onChange={(event) => update("dateTo", event.target.value)} />
        <Select
          label={t("transactions.filters.sortBy")}
          value={ordering}
          onChange={(event) => onOrderingChange(event.target.value)}
          options={sortOptions}
          className={styles.sort}
        />
        {hasActiveFilters && (
          <Button variant="ghost" leadingIcon="x" className={styles.clear} onClick={() => onChange(emptyTransactionFilters)}>
            {t("transactions.filters.clear")}
          </Button>
        )}
      </div>
    </div>
  );
}
