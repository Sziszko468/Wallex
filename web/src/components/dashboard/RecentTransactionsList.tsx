import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon="transactions"
        message={t("dashboard.recent.empty")}
        action={
          <ButtonLink to="/transactions" variant="secondary" size="sm">
            {t("dashboard.recent.goTo")}
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
