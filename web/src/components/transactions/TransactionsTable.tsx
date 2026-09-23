import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { formatCurrency, formatDate } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import styles from "./TransactionsTable.module.scss";

type SortableField = "date" | "amount";

interface TransactionsTableProps {
  transactions: Transaction[];
  categoriesById: Map<number, Category>;
  ordering: string;
  onSortChange: (ordering: string) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

function toggleOrdering(current: string, field: SortableField): string {
  if (current === field) return `-${field}`;
  return field;
}

function ariaSortFor(current: string, field: SortableField): "ascending" | "descending" | "none" {
  if (current === field) return "ascending";
  if (current === `-${field}`) return "descending";
  return "none";
}

function sortIndicator(current: string, field: SortableField): string {
  if (current === field) return " ▲";
  if (current === `-${field}`) return " ▼";
  return "";
}

export function TransactionsTable({
  transactions,
  categoriesById,
  ordering,
  onSortChange,
  onEdit,
  onDelete,
}: TransactionsTableProps) {
  if (transactions.length === 0) {
    return <EmptyState message="No transactions match your filters." />;
  }

  function renderSortableHeader(field: SortableField, label: string) {
    return (
      <th scope="col" aria-sort={ariaSortFor(ordering, field)}>
        <button
          type="button"
          className={styles.sortButton}
          onClick={() => onSortChange(toggleOrdering(ordering, field))}
        >
          {label}
          {sortIndicator(ordering, field)}
        </button>
      </th>
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>Transactions</caption>
        <thead>
          <tr>
            {renderSortableHeader("date", "Date")}
            <th scope="col">Description</th>
            <th scope="col">Category</th>
            <th scope="col">Type</th>
            {renderSortableHeader("amount", "Amount")}
            <th scope="col" className={styles.actionsHeader}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const category = categoriesById.get(transaction.category);
            const isIncome = transaction.type === "income";
            const label = transaction.description || category?.name || "transaction";

            return (
              <tr key={transaction.id}>
                <td>{formatDate(transaction.date)}</td>
                <td className={styles.description}>{transaction.description || "—"}</td>
                <td>
                  {category && (
                    <span className={styles.categoryBadge}>
                      <span
                        className={styles.categoryDot}
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className={isIncome ? `${styles.typeBadge} ${styles.income}` : `${styles.typeBadge} ${styles.expense}`}
                  >
                    {isIncome ? "Income" : "Expense"}
                  </span>
                </td>
                <td className={isIncome ? styles.income : styles.expense}>
                  {isIncome ? "+" : "-"}
                  {formatCurrency(transaction.amount)}
                </td>
                <td className={styles.actionsCell}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => onEdit(transaction)}
                    aria-label={`Edit ${label}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.deleteButton}`}
                    onClick={() => onDelete(transaction)}
                    aria-label={`Delete ${label}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
