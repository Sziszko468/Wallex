import { Link } from "react-router-dom";
import type { Category } from "../../types/category";
import type { Subscription } from "../../types/subscription";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatDate } from "../../utils/format";
import { PERIOD_LABELS } from "../../utils/subscriptions";
import { EmptyState } from "../EmptyState";
import { SubscriptionStatusBadge } from "./SubscriptionStatusBadge";
import styles from "./SubscriptionsTable.module.scss";

interface SubscriptionsTableProps {
  subscriptions: Subscription[];
  categoriesById: Map<number, Category>;
  onEdit: (subscription: Subscription) => void;
  onDelete: (subscription: Subscription) => void;
}

export function SubscriptionsTable({ subscriptions, categoriesById, onEdit, onDelete }: SubscriptionsTableProps) {
  const baseCurrency = useBaseCurrency();
  if (subscriptions.length === 0) {
    return <EmptyState message="No subscriptions yet. Add Netflix, Spotify, your gym or phone plan to see what they cost." />;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>Subscriptions</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Category</th>
            <th scope="col">Price</th>
            <th scope="col">Per month</th>
            <th scope="col">Next payment</th>
            <th scope="col">Status</th>
            <th scope="col" className={styles.actionsHeader}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((subscription) => {
            const category = categoriesById.get(subscription.category);
            return (
              <tr key={subscription.id} className={subscription.status === "active" ? undefined : styles.inactiveRow}>
                <td>
                  <Link to={`/subscriptions/${subscription.id}`} className={styles.name}>
                    {subscription.name}
                  </Link>
                  {subscription.merchant && <span className={styles.merchant}>{subscription.merchant}</span>}
                </td>
                <td>
                  {category && (
                    <span className={styles.categoryBadge}>
                      <span className={styles.dot} style={{ backgroundColor: category.color }} />
                      {category.name}
                    </span>
                  )}
                </td>
                <td>
                  {formatCurrency(subscription.amount, subscription.currency)}
                  <span className={styles.period}> / {PERIOD_LABELS[subscription.frequency]}</span>
                </td>
                <td className={styles.cost}>
                  {subscription.base_monthly_cost === null ? (
                    <span title="No recent exchange rate">—</span>
                  ) : (
                    <>
                      {subscription.currency !== baseCurrency && "≈ "}
                      {formatCurrency(subscription.base_monthly_cost, baseCurrency)}
                    </>
                  )}
                </td>
                <td>{subscription.next_payment_date ? formatDate(subscription.next_payment_date) : "—"}</td>
                <td>
                  <SubscriptionStatusBadge status={subscription.status} />
                </td>
                <td className={styles.actionsCell}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => onEdit(subscription)}
                    aria-label={`Edit ${subscription.name}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.deleteButton}`}
                    onClick={() => onDelete(subscription)}
                    aria-label={`Delete ${subscription.name}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
