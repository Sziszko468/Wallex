import { Link } from "react-router-dom";
import type { CurrencyCode } from "../../types/currency";
import type { UpcomingSubscriptionPayment } from "../../types/subscription";
import { formatCurrency, formatDate } from "../../utils/format";
import { EmptyState } from "../EmptyState";
import styles from "./SubscriptionLists.module.scss";

interface UpcomingPaymentsListProps {
  payments: UpcomingSubscriptionPayment[];
  baseCurrency: CurrencyCode;
}

/** The next 30 days' payments, as the API lists them (soonest first). */
export function UpcomingPaymentsList({ payments, baseCurrency }: UpcomingPaymentsListProps) {
  if (payments.length === 0) {
    return <EmptyState message="No payments due in the next 30 days." />;
  }

  return (
    <ul className={styles.list}>
      {payments.map((payment) => (
        <li key={`${payment.subscription_id}-${payment.date}`} className={styles.item}>
          <span className={styles.date}>{formatDate(payment.date)}</span>
          <Link to={`/subscriptions/${payment.subscription_id}`} className={styles.name}>
            {payment.name}
          </Link>
          <span className={styles.amount}>
            {formatCurrency(payment.amount, payment.currency)}
            {payment.currency !== baseCurrency && payment.base_amount !== null && (
              <span className={styles.secondary}> ≈ {formatCurrency(payment.base_amount, baseCurrency)}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
