import type { TransactionType } from "../types/category";
import styles from "./TypeToggle.module.scss";

interface TypeToggleProps {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
}

export function TypeToggle({ value, onChange }: TypeToggleProps) {
  return (
    <div className={styles.toggle} role="radiogroup" aria-label="Transaction type">
      <button
        type="button"
        role="radio"
        aria-checked={value === "expense"}
        className={
          value === "expense" ? `${styles.segment} ${styles.expenseActive}` : styles.segment
        }
        onClick={() => onChange("expense")}
      >
        Expense
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "income"}
        className={
          value === "income" ? `${styles.segment} ${styles.incomeActive}` : styles.segment
        }
        onClick={() => onChange("income")}
      >
        Income
      </button>
    </div>
  );
}
