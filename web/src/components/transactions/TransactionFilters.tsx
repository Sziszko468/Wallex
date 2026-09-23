import type { Category } from "../../types/category";
import type { TransactionType } from "../../types/category";
import { TextField } from "../TextField";
import { Select } from "../Select";
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

interface TransactionFiltersProps {
  value: TransactionFiltersValue;
  categories: Category[];
  onChange: (value: TransactionFiltersValue) => void;
}

export function TransactionFilters({ value, categories, onChange }: TransactionFiltersProps) {
  function update<K extends keyof TransactionFiltersValue>(
    key: K,
    fieldValue: TransactionFiltersValue[K]
  ) {
    onChange({ ...value, [key]: fieldValue });
  }

  const hasActiveFilters = Object.values(value).some(Boolean);

  return (
    <div className={styles.filters}>
      <TextField
        label="Search"
        type="search"
        placeholder="Search description…"
        value={value.search}
        onChange={(event) => update("search", event.target.value)}
      />
      <Select
        label="Type"
        placeholder="All types"
        value={value.type}
        onChange={(event) => update("type", event.target.value as TransactionType | "")}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
        ]}
      />
      <Select
        label="Category"
        placeholder="All categories"
        value={value.category}
        onChange={(event) => update("category", event.target.value)}
        options={categories.map((category) => ({
          value: String(category.id),
          label: category.name,
        }))}
      />
      <TextField
        label="From"
        type="date"
        value={value.dateFrom}
        onChange={(event) => update("dateFrom", event.target.value)}
      />
      <TextField
        label="To"
        type="date"
        value={value.dateTo}
        onChange={(event) => update("dateTo", event.target.value)}
      />
      <button
        type="button"
        className={styles.clearButton}
        onClick={() => onChange(emptyTransactionFilters)}
        disabled={!hasActiveFilters}
      >
        Clear filters
      </button>
    </div>
  );
}
