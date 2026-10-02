import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Category } from "../../types/category";
import type { Subscription } from "../../types/subscription";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { formatCurrency, formatDate } from "../../utils/format";
import { periodLabel } from "../../utils/subscriptions";
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
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();

  return (
    <RowList label={t("subscriptions.listLabel")}>
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
                {subscription.next_payment_date && <span>{t("recurring.next", { date: formatDate(subscription.next_payment_date) })}</span>}
              </>
            }
            trailing={
              <>
                <span>
                  {formatCurrency(subscription.amount, subscription.currency)}
                  <span className={styles.period}> / {periodLabel(subscription.frequency)}</span>
                </span>
                {showMonthly &&
                  (subscription.base_monthly_cost === null ? (
                    <span className={styles.secondary} title={t("subscriptions.row.noRateTitle")}>
                      {t("subscriptions.row.noRate")}
                    </span>
                  ) : (
                    <span className={styles.secondary}>
                      {isForeign && "≈ "}
                      {formatCurrency(subscription.base_monthly_cost, baseCurrency)}
                      <span> / {t("subscriptions.row.perMonth")}</span>
                    </span>
                  ))}
                <SubscriptionStatusBadge status={subscription.status} />
              </>
            }
            actions={
              <>
                <IconButton icon="pencil" label={t("common.item.edit", { name: subscription.name })} size="sm" onClick={() => onEdit(subscription)} />
                <IconButton icon="trash" label={t("common.item.delete", { name: subscription.name })} variant="danger" size="sm" onClick={() => onDelete(subscription)} />
              </>
            }
          />
        );
      })}
    </RowList>
  );
}
