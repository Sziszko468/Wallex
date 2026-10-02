import { useTranslation } from "react-i18next";
import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatDate, formatDateTime, formatRate } from "../../utils/format";
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

/**
 * One transaction in full: a drawer on desktop, a bottom sheet on phones. The amount leads;
 * the facts follow; Edit and Delete sit at the end. Only fields the API actually has are shown.
 */
export function TransactionDetailDrawer({ transaction, category, onClose, onEdit, onDelete }: TransactionDetailDrawerProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  if (!transaction) return null;

  const isIncome = transaction.type === "income";
  const isForeign = transaction.currency !== baseCurrency;
  const name = transaction.description || category?.name || t("transactions.fallbackName");

  const items = [
    {
      label: t("transactions.detail.type"),
      value: (
        <Badge tone={isIncome ? "success" : "neutral"} icon={isIncome ? "arrow-down-left" : "arrow-up-right"}>
          {isIncome ? t("common.transactionType.income") : t("common.transactionType.expense")}
        </Badge>
      ),
    },
    { label: t("transactions.detail.category"), value: category?.name ?? t("common.states.notAvailable") },
    { label: t("transactions.detail.date"), value: formatDate(transaction.date) },
    { label: t("transactions.detail.paidIn"), value: transaction.currency },
    ...(isForeign
      ? [
          { label: t("transactions.detail.inYourCurrency"), value: formatCurrency(transaction.base_amount, baseCurrency) },
          {
            label: t("transactions.detail.exchangeRate"),
            value: t("transactions.detail.rate", {
              currency: transaction.currency,
              rate: formatRate(transaction.exchange_rate),
              base: baseCurrency,
            }),
          },
        ]
      : []),
    { label: t("transactions.detail.added"), value: formatDateTime(transaction.created_at) },
    ...(transaction.updated_at !== transaction.created_at
      ? [{ label: t("transactions.detail.lastChanged"), value: formatDateTime(transaction.updated_at) }]
      : []),
  ];

  return (
    <Modal isOpen onClose={onClose} title={t("transactions.detail.title")} placement="right">
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
            {t("transactions.detail.edit")}
          </Button>
          <Button variant="danger-quiet" leadingIcon="trash" onClick={() => onDelete(transaction)}>
            {t("transactions.detail.delete")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
