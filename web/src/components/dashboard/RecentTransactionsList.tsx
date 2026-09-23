import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { formatCurrency, formatDate } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import styles from "./RecentTransactionsList.module.scss";

interface RecentTransactionsListProps {
  transactions: Transaction[];
  categoriesById: Map<number, Category>;
}

export function RecentTransactionsList({
  transactions,
  categoriesById,
}: RecentTransactionsListProps) {
  if (transactions.length === 0) {
    return <EmptyState message="No transactions yet. Add your first one to see it here." />;
  }

  return (
    <ul className={styles.list}>
      {transactions.map((transaction) => {
        const category = categoriesById.get(transaction.category);
        return (
          <li key={transaction.id} className={styles.item}>
            <div className={styles.details}>
              <span className={styles.description}>
                {transaction.description || category?.name || "Transaction"}
              </span>
              <span className={styles.meta}>
                {formatDate(transaction.date)}
                {category ? ` · ${category.name}` : ""}
              </span>
            </div>
            <span
              className={
                transaction.type === "income"
                  ? `${styles.amount} ${styles.income}`
                  : `${styles.amount} ${styles.expense}`
              }
            >
              {transaction.type === "income" ? "+" : "-"}
              {formatCurrency(transaction.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
