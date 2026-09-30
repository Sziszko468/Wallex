import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { ButtonLink } from "../ButtonLink";
import { EmptyState } from "../EmptyState";
import { TransactionRow } from "../transactions/TransactionRow";
import styles from "./RecentTransactionsList.module.scss";

interface RecentTransactionsListProps {
  transactions: Transaction[];
  categoriesById: Map<number, Category>;
}

export function RecentTransactionsList({ transactions, categoriesById }: RecentTransactionsListProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon="transactions"
        message="No transactions yet. Add your first one to see it here."
        action={
          <ButtonLink to="/transactions" variant="secondary" size="sm">
            Go to transactions
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ul className={styles.list}>
      {transactions.map((transaction) => (
        <TransactionRow
          key={transaction.id}
          transaction={transaction}
          category={categoriesById.get(transaction.category)}
          showDate
        />
      ))}
    </ul>
  );
}
