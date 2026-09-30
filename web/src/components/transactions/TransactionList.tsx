import { useId } from "react";
import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { formatDayHeading } from "../../utils/format";
import { TransactionRow } from "./TransactionRow";
import styles from "./TransactionList.module.scss";

interface TransactionListProps {
  transactions: Transaction[];
  categoriesById: Map<number, Category>;
  /** Group rows under a heading per day. Only makes sense while they're in date order. */
  groupByDay: boolean;
  onOpen: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

interface DayGroup {
  date: string;
  rows: Transaction[];
}

/** Consecutive rows with the same date share a group (the API returns them already ordered). */
function groupByDate(transactions: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const transaction of transactions) {
    const last = groups[groups.length - 1];
    if (last && last.date === transaction.date) last.rows.push(transaction);
    else groups.push({ date: transaction.date, rows: [transaction] });
  }
  return groups;
}

export function TransactionList({ transactions, categoriesById, groupByDay, onOpen, onEdit, onDelete }: TransactionListProps) {
  const idPrefix = useId();

  function renderRows(rows: Transaction[], showDate: boolean) {
    return (
      <ul className={styles.rows}>
        {rows.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            category={categoriesById.get(transaction.category)}
            showDate={showDate}
            onOpen={onOpen}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    );
  }

  // Sorted by amount, days would be scattered: one flat list, with the date on each row.
  if (!groupByDay) {
    return <div className={styles.surface}>{renderRows(transactions, true)}</div>;
  }

  return (
    <div className={styles.groups}>
      {groupByDate(transactions).map((group) => {
        const headingId = `${idPrefix}-${group.date}`;
        return (
          <section key={group.date} className={styles.group} aria-labelledby={headingId}>
            <h2 id={headingId} className={styles.dayHeading}>
              {formatDayHeading(group.date)}
            </h2>
            <div className={styles.surface}>{renderRows(group.rows, false)}</div>
          </section>
        );
      })}
    </div>
  );
}
