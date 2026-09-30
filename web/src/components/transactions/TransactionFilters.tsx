import { useId, useState } from "react";
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

const TYPE_OPTIONS: readonly SegmentedOption<TypeFilter>[] = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
];

// The API sorts amounts by base_amount — their value in one currency — so 15,000 HUF ranks below 50 EUR.
const SORT_OPTIONS = [
  { value: "-date", label: "Newest first" },
  { value: "date", label: "Oldest first" },
  { value: "-base_amount", label: "Highest amount" },
  { value: "base_amount", label: "Lowest amount" },
];

interface TransactionFiltersProps {
  value: TransactionFiltersValue;
  categories: Category[];
  ordering: string;
  onChange: (value: TransactionFiltersValue) => void;
  onOrderingChange: (ordering: string) => void;
}

export function TransactionFilters({ value, categories, ordering, onChange, onOrderingChange }: TransactionFiltersProps) {
  const panelId = useId();
  // On phones the secondary filters fold away behind a "Filters" button; wider screens show them all.
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  function update<K extends keyof TransactionFiltersValue>(key: K, fieldValue: TransactionFiltersValue[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  const hasActiveFilters = Object.values(value).some(Boolean);
  const activeSecondaryCount = [value.category, value.dateFrom, value.dateTo].filter(Boolean).length;

  return (
    <div className={styles.filters} role="search" aria-label="Filter transactions">
      <div className={styles.primary}>
        <TextField
          label="Search"
          hideLabel
          type="search"
          leadingIcon="search"
          placeholder="Search transactions…"
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
          {activeSecondaryCount > 0 ? `Filters (${activeSecondaryCount})` : "Filters"}
        </Button>
        <div className={styles.type}>
          <SegmentedControl
            options={TYPE_OPTIONS}
            value={value.type === "" ? "all" : value.type}
            onChange={(next) => update("type", next === "all" ? "" : next)}
            label="Transaction type"
            fullWidth
          />
        </div>
      </div>

      <div id={panelId} className={isPanelOpen ? `${styles.panel} ${styles.panelOpen}` : styles.panel}>
        <Select
          label="Category"
          placeholder="All categories"
          value={value.category}
          onChange={(event) => update("category", event.target.value)}
          options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
          className={styles.category}
        />
        <TextField label="From" type="date" value={value.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} />
        <TextField label="To" type="date" value={value.dateTo} onChange={(event) => update("dateTo", event.target.value)} />
        <Select
          label="Sort by"
          value={ordering}
          onChange={(event) => onOrderingChange(event.target.value)}
          options={SORT_OPTIONS}
          className={styles.sort}
        />
        {hasActiveFilters && (
          <Button variant="ghost" leadingIcon="x" className={styles.clear} onClick={() => onChange(emptyTransactionFilters)}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
