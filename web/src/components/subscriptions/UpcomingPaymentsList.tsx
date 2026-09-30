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

/** "Sep" / "30" for the date block. Built from the ISO parts so the day never shifts with the time zone. */
function dateParts(isoDate: string): { day: string; month: string } {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  return { day: String(date.getDate()), month: date.toLocaleDateString(undefined, { month: "short" }) };
}

/** The next 30 days' payments, as the API lists them (soonest first). */
export function UpcomingPaymentsList({ payments, baseCurrency }: UpcomingPaymentsListProps) {
  if (payments.length === 0) {
    return <EmptyState icon="calendar" message="No payments due in the next 30 days." />;
  }

  return (
    <ul className={styles.list}>
      {payments.map((payment) => {
        const { day, month } = dateParts(payment.date);
        return (
          <li key={`${payment.subscription_id}-${payment.date}`} className={styles.item}>
            <span className={styles.date}>
              <span className={styles.srOnly}>{formatDate(payment.date)}</span>
              <span className={styles.day} aria-hidden="true">
                {day}
              </span>
              <span className={styles.month} aria-hidden="true">
                {month}
              </span>
            </span>
            <Link to={`/subscriptions/${payment.subscription_id}`} className={styles.name}>
              {payment.name}
            </Link>
            <span className={styles.amount}>
              <span>{formatCurrency(payment.amount, payment.currency)}</span>
              {payment.currency !== baseCurrency && payment.base_amount !== null && (
                <span className={styles.secondary}>≈ {formatCurrency(payment.base_amount, baseCurrency)}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
