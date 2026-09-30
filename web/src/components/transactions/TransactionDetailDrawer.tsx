import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatDate, formatDateTime } from "../../utils/format";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { CategoryMark } from "../CategoryMark";
import { DetailList } from "../DetailList";
import { Modal } from "../Modal";
import { TransactionAmount } from "./TransactionAmount";
import styles from "./TransactionDetailDrawer.module.scss";

interface TransactionDetailDrawerProps {
  /** null = closed. */
  transaction: Transaction | null;
  category: Category | undefined;
  onClose: () => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

const rateFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });

/**
 * One transaction in full: a drawer on desktop, a bottom sheet on phones. The amount leads;
 * the facts follow; Edit and Delete sit at the end. Only fields the API actually has are shown.
 */
export function TransactionDetailDrawer({ transaction, category, onClose, onEdit, onDelete }: TransactionDetailDrawerProps) {
  const baseCurrency = useBaseCurrency();
  if (!transaction) return null;

  const isIncome = transaction.type === "income";
  const isForeign = transaction.currency !== baseCurrency;
  const name = transaction.description || category?.name || "Transaction";

  const items = [
    {
      label: "Type",
      value: (
        <Badge tone={isIncome ? "success" : "neutral"} icon={isIncome ? "arrow-down-left" : "arrow-up-right"}>
          {isIncome ? "Income" : "Expense"}
        </Badge>
      ),
    },
    { label: "Category", value: category?.name ?? "—" },
    { label: "Date", value: formatDate(transaction.date) },
    { label: "Paid in", value: transaction.currency },
    ...(isForeign
      ? [
          { label: "In your currency", value: formatCurrency(transaction.base_amount, baseCurrency) },
          {
            label: "Exchange rate",
            value: `1 ${transaction.currency} = ${rateFormatter.format(Number(transaction.exchange_rate))} ${baseCurrency}`,
          },
        ]
      : []),
    { label: "Added", value: formatDateTime(transaction.created_at) },
    ...(transaction.updated_at !== transaction.created_at
      ? [{ label: "Last changed", value: formatDateTime(transaction.updated_at) }]
      : []),
  ];

  return (
    <Modal isOpen onClose={onClose} title="Transaction" placement="right">
      <div className={styles.content}>
        <div className={styles.summary}>
          <CategoryMark category={category} size="lg" />
          <div className={styles.summaryText}>
            <p className={styles.name}>{name}</p>
            {transaction.description && category && <p className={styles.category}>{category.name}</p>}
          </div>
        </div>

        <TransactionAmount transaction={transaction} align="start" size="xl" />

        <DetailList items={items} />

        <div className={styles.actions}>
          <Button variant="secondary" leadingIcon="pencil" onClick={() => onEdit(transaction)}>
            Edit
          </Button>
          <Button variant="danger-quiet" leadingIcon="trash" onClick={() => onDelete(transaction)}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
