import type { RecurringTransaction } from "../../types/recurringTransaction";
import type { Category } from "../../types/category";
import { formatCurrency, formatDate } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import styles from "./RecurringTransactionsTable.module.scss";

const FREQUENCY_LABELS: Record<RecurringTransaction["frequency"], string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

interface RecurringTransactionsTableProps {
  items: RecurringTransaction[];
  categoriesById: Map<number, Category>;
  onEdit: (item: RecurringTransaction) => void;
  onDelete: (item: RecurringTransaction) => void;
  onToggleActive: (item: RecurringTransaction) => void;
  togglingId: number | null;
}

export function RecurringTransactionsTable({
  items,
  categoriesById,
  onEdit,
  onDelete,
  onToggleActive,
  togglingId,
}: RecurringTransactionsTableProps) {
  if (items.length === 0) {
    return <EmptyState message="No recurring transactions yet. Add rent, subscriptions, or bills to track them automatically." />;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>Recurring transactions</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
            <th scope="col">Frequency</th>
            <th scope="col">Next occurrence</th>
            <th scope="col">Status</th>
            <th scope="col" className={styles.actionsHeader}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const category = categoriesById.get(item.category);
            const isIncome = item.type === "income";
            return (
              <tr key={item.id} className={item.is_active ? undefined : styles.inactiveRow}>
                <td className={styles.name}>{item.name}</td>
                <td>
                  {category && (
                    <span className={styles.categoryBadge}>
                      <span
                        className={styles.dot}
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </span>
                  )}
                </td>
                <td className={isIncome ? styles.income : styles.expense}>
                  {isIncome ? "+" : "-"}
                  {formatCurrency(item.amount)}
                </td>
                <td>{FREQUENCY_LABELS[item.frequency]}</td>
                <td>{formatDate(item.next_occurrence_date)}</td>
                <td>
                  <span
                    className={item.is_active ? styles.statusActive : styles.statusPaused}
                  >
                    {item.is_active ? "Active" : "Paused"}
                  </span>
                </td>
                <td className={styles.actionsCell}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => onToggleActive(item)}
                    disabled={togglingId === item.id}
                  >
                    {item.is_active ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => onEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.deleteButton}`}
                    onClick={() => onDelete(item)}
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
