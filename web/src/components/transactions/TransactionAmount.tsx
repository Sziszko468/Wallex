import type { Transaction } from "../../types/transaction";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency } from "../../utils/format";
import styles from "./TransactionAmount.module.scss";

interface TransactionAmountProps {
  transaction: Transaction;
  /** "start" left-aligns it (the detail drawer); lists right-align. */
  align?: "start" | "end";
  /** "xl" is the headline size used in the detail view. */
  size?: "md" | "xl";
}

/**
 * The amount as paid ("−15 000 Ft"), plus its value in the base currency underneath ("≈ €38.48")
 * when the two differ. Both figures come from the API.
 *
 * Income and spending differ in the sign *and* the treatment, never by colour alone:
 * income is "+" in the income colour, spending is "−" in the regular text colour.
 */
export function TransactionAmount({ transaction, align = "end", size = "md" }: TransactionAmountProps) {
  const baseCurrency = useBaseCurrency();
  const isIncome = transaction.type === "income";
  const sign = isIncome ? "+" : "−";

  return (
    <span className={[styles.amount, align === "start" ? styles.start : "", size === "xl" ? styles.xl : ""].filter(Boolean).join(" ")}>
      <span className={isIncome ? styles.income : styles.expense}>
        {sign}
        {formatCurrency(transaction.amount, transaction.currency)}
      </span>
      {transaction.currency !== baseCurrency && (
        <span className={styles.converted}>≈ {formatCurrency(transaction.base_amount, baseCurrency)}</span>
      )}
    </span>
  );
}
