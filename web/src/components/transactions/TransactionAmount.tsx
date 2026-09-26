import type { Transaction } from "../../types/transaction";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency } from "../../utils/format";
import styles from "./TransactionAmount.module.scss";

interface TransactionAmountProps {
  transaction: Transaction;
}

/**
 * The amount as paid ("-15,000 HUF"), plus its value in the base currency
 * underneath ("≈ €41.06") when the two differ. Both figures come from the API.
 */
export function TransactionAmount({ transaction }: TransactionAmountProps) {
  const baseCurrency = useBaseCurrency();
  const sign = transaction.type === "income" ? "+" : "-";

  return (
    <span className={styles.amount}>
      <span>
        {sign}
        {formatCurrency(transaction.amount, transaction.currency)}
      </span>
      {transaction.currency !== baseCurrency && (
        <span className={styles.converted}>≈ {formatCurrency(transaction.base_amount, baseCurrency)}</span>
      )}
    </span>
  );
}
