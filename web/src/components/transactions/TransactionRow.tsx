import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { formatDate } from "../../utils/format";
import { CategoryMark } from "../CategoryMark";
import { IconButton } from "../IconButton";
import { TransactionAmount } from "./TransactionAmount";
import styles from "./TransactionRow.module.scss";

interface TransactionRowProps {
  transaction: Transaction;
  category: Category | undefined;
  /** Show the date under the name — for lists that aren't already grouped by day. */
  showDate?: boolean;
  /** Makes the whole row a button that opens the transaction's details. */
  onOpen?: (transaction: Transaction) => void;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
}

/**
 * One transaction, lightweight: category mark, what it was, category · date, amount.
 * No borders between rows — space and a soft hover do the separating.
 */
export function TransactionRow({ transaction, category, showDate = false, onOpen, onEdit, onDelete }: TransactionRowProps) {
  const name = transaction.description || category?.name || "Transaction";
  // With no description the category is already the title; don't say it twice.
  const meta = [transaction.description ? category?.name : undefined, showDate ? formatDate(transaction.date) : undefined]
    .filter(Boolean)
    .join(" · ");

  const content = (
    <>
      <CategoryMark category={category} />
      <span className={styles.text}>
        <span className={styles.title}>{name}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
      <TransactionAmount transaction={transaction} />
    </>
  );

  return (
    <li className={styles.row}>
      {onOpen ? (
        <button type="button" className={`${styles.main} ${styles.interactive}`} onClick={() => onOpen(transaction)}>
          {content}
        </button>
      ) : (
        <div className={styles.main}>{content}</div>
      )}
      {(onEdit || onDelete) && (
        <div className={styles.actions}>
          {onEdit && <IconButton icon="pencil" label={`Edit ${name}`} size="sm" onClick={() => onEdit(transaction)} />}
          {onDelete && <IconButton icon="trash" label={`Delete ${name}`} variant="danger" size="sm" onClick={() => onDelete(transaction)} />}
        </div>
      )}
    </li>
  );
}
