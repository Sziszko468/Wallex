import { Link } from "react-router-dom";
import type { Category } from "../../types/category";
import type { Subscription } from "../../types/subscription";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatDate } from "../../utils/format";
import { PERIOD_LABELS } from "../../utils/subscriptions";
import { CategoryMark } from "../CategoryMark";
import { IconButton } from "../IconButton";
import { ListRow, RowList } from "../ListRow";
import { SubscriptionStatusBadge } from "./SubscriptionStatusBadge";
import styles from "./SubscriptionsList.module.scss";

interface SubscriptionsListProps {
  subscriptions: Subscription[];
  categoriesById: Map<number, Category>;
  onEdit: (subscription: Subscription) => void;
  onDelete: (subscription: Subscription) => void;
}

export function SubscriptionsList({ subscriptions, categoriesById, onEdit, onDelete }: SubscriptionsListProps) {
  const baseCurrency = useBaseCurrency();

  return (
    <RowList label="Subscriptions">
      {subscriptions.map((subscription) => {
        const category = categoriesById.get(subscription.category);
        const isForeign = subscription.currency !== baseCurrency;
        // A second line only when it adds something: another currency, or a yearly/weekly plan.
        const showMonthly = isForeign || subscription.frequency !== "monthly";

        return (
          <ListRow
            key={subscription.id}
            dimmed={subscription.status !== "active"}
            leading={<CategoryMark category={category} />}
            title={<Link to={`/subscriptions/${subscription.id}`}>{subscription.name}</Link>}
            meta={
              <>
                {subscription.merchant && <span>{subscription.merchant}</span>}
                {category && <span>{category.name}</span>}
                {subscription.next_payment_date && <span>Next {formatDate(subscription.next_payment_date)}</span>}
              </>
            }
            trailing={
              <>
                <span>
                  {formatCurrency(subscription.amount, subscription.currency)}
                  <span className={styles.period}> / {PERIOD_LABELS[subscription.frequency]}</span>
                </span>
                {showMonthly &&
                  (subscription.base_monthly_cost === null ? (
                    <span className={styles.secondary} title="No recent exchange rate">
                      no exchange rate
                    </span>
                  ) : (
                    <span className={styles.secondary}>
                      {isForeign && "≈ "}
                      {formatCurrency(subscription.base_monthly_cost, baseCurrency)}
                      <span> / month</span>
                    </span>
                  ))}
                <SubscriptionStatusBadge status={subscription.status} />
              </>
            }
            actions={
              <>
                <IconButton icon="pencil" label={`Edit ${subscription.name}`} size="sm" onClick={() => onEdit(subscription)} />
                <IconButton icon="trash" label={`Delete ${subscription.name}`} variant="danger" size="sm" onClick={() => onDelete(subscription)} />
              </>
            }
          />
        );
      })}
    </RowList>
  );
}
