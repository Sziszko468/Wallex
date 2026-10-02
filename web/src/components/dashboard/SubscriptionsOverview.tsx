import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  if (subscriptions.active_count === 0) {
    return (
      <EmptyState
        icon="subscriptions"
        message={t("dashboard.subscriptions.empty")}
        action={
          <ButtonLink to="/subscriptions" variant="secondary" size="sm" leadingIcon="plus">
            {t("dashboard.subscriptions.add")}
          </ButtonLink>
        }
      />
    );
  }

  const figures = [
    { label: t("dashboard.subscriptions.perMonth"), value: subscriptions.monthly_total, primary: true },
    { label: t("dashboard.subscriptions.yearly"), value: subscriptions.yearly_total, primary: false },
    { label: t("dashboard.subscriptions.billed"), value: subscriptions.due_this_month, primary: false },
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
          {t("dashboard.subscriptions.active", { count: subscriptions.active_count })}
          {subscriptions.unconverted_currencies.length > 0 &&
            ` · ${t("dashboard.subscriptions.notIncluded", { currencies: subscriptions.unconverted_currencies.join(", ") })}`}
        </span>
        <Link to="/subscriptions" className={styles.link}>
          {t("dashboard.subscriptions.manage")}
        </Link>
      </div>
    </div>
  );
}
