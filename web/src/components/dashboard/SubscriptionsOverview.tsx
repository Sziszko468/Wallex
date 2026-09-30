import { Link } from "react-router-dom";
import type { DashboardSubscriptions } from "../../types/dashboard";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency } from "../../utils/format";
import { ButtonLink } from "../ButtonLink";
import { EmptyState } from "../EmptyState";
import styles from "./SubscriptionsOverview.module.scss";

interface SubscriptionsOverviewProps {
  subscriptions: DashboardSubscriptions;
}

/** The month's subscriptions from the dashboard response — every figure computed by the API. */
export function SubscriptionsOverview({ subscriptions }: SubscriptionsOverviewProps) {
  const baseCurrency = useBaseCurrency();
  if (subscriptions.active_count === 0) {
    return (
      <EmptyState
        icon="subscriptions"
        message="No subscriptions this month. Add them to see what they cost over a year."
        action={
          <ButtonLink to="/subscriptions" variant="secondary" size="sm" leadingIcon="plus">
            Add your subscriptions
          </ButtonLink>
        }
      />
    );
  }

  const figures = [
    { label: "Per month", value: subscriptions.monthly_total, primary: true },
    { label: "Yearly projection", value: subscriptions.yearly_total, primary: false },
    { label: "Billed this month", value: subscriptions.due_this_month, primary: false },
  ];

  return (
    <div className={styles.overview}>
      <dl className={styles.figures}>
        {figures.map((figure) => (
          <div key={figure.label} className={figure.primary ? `${styles.figure} ${styles.primary}` : styles.figure}>
            <dt className={styles.label}>{figure.label}</dt>
            <dd className={styles.value}>{formatCurrency(figure.value, baseCurrency)}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.footer}>
        <span className={styles.meta}>
          {subscriptions.active_count} active {subscriptions.active_count === 1 ? "subscription" : "subscriptions"}
          {subscriptions.unconverted_currencies.length > 0 &&
            ` · ${subscriptions.unconverted_currencies.join(", ")} not included (no exchange rate)`}
        </span>
        <Link to="/subscriptions" className={styles.link}>
          Manage subscriptions
        </Link>
      </div>
    </div>
  );
}
