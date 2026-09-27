import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteSubscription, getSubscription } from "../services/subscriptionsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import type { Subscription } from "../types/subscription";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { StatCard } from "../components/dashboard/StatCard";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { SubscriptionFormModal } from "../components/subscriptions/SubscriptionFormModal";
import { SubscriptionStatusBadge } from "../components/subscriptions/SubscriptionStatusBadge";
import { extractErrorMessage } from "../utils/errors";
import { formatCurrency, formatDate } from "../utils/format";
import { FREQUENCY_LABELS, PERIOD_LABELS } from "../utils/subscriptions";
import styles from "./SubscriptionDetailPage.module.scss";

export function SubscriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const subscriptionId = Number(id);

  const fetchSubscription = useCallback(() => getSubscription(subscriptionId), [subscriptionId]);
  const subscription = useAsyncData(fetchSubscription);

  const fetchCategories = useCallback(() => listCategories(), []);
  const categories = useAsyncData(fetchCategories);

  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function confirmDelete() {
    setIsDeleting(true);
    try {
      await deleteSubscription(subscriptionId);
      navigate("/subscriptions", { replace: true });
    } catch (error) {
      setActionError(extractErrorMessage(error));
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  }

  function handleSaved() {
    setIsEditing(false);
    subscription.refetch();
  }

  const category = useMemo(
    () => categories.data?.find((item) => item.id === subscription.data?.category),
    [categories.data, subscription.data]
  );

  return (
    <div className={styles.page}>
      <Link to="/subscriptions" className={styles.backLink}>
        ← All subscriptions
      </Link>

      <ErrorBanner message={actionError} />

      {subscription.isLoading ? (
        <Skeleton height={320} borderRadius={8} />
      ) : subscription.error || !subscription.data ? (
        <ErrorState error={subscription.error} onRetry={subscription.refetch} />
      ) : (
        <>
          <div className={styles.headerRow}>
            <div>
              <h1 className={styles.heading}>
                {subscription.data.name} <SubscriptionStatusBadge status={subscription.data.status} />
              </h1>
              {subscription.data.merchant && <p className={styles.merchant}>{subscription.data.merchant}</p>}
            </div>
            <div className={styles.actions}>
              <Button type="button" variant="secondary" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
              <Button type="button" variant="danger" onClick={() => setIsConfirmingDelete(true)}>
                Delete
              </Button>
            </div>
          </div>

          <SubscriptionDetails subscription={subscription.data} categoryName={category?.name} />
        </>
      )}

      <SubscriptionFormModal
        isOpen={isEditing}
        subscription={subscription.data}
        categories={categories.data ?? []}
        onClose={() => setIsEditing(false)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Delete subscription"
        message={`Delete "${subscription.data?.name ?? ""}"? Payments you already recorded stay in your transactions.`}
        confirmLabel="Delete"
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onClose={() => setIsConfirmingDelete(false)}
      />
    </div>
  );
}

interface SubscriptionDetailsProps {
  subscription: Subscription;
  categoryName?: string;
}

function SubscriptionDetails({ subscription, categoryName }: SubscriptionDetailsProps) {
  const baseCurrency = useBaseCurrency();
  const isForeign = subscription.currency !== baseCurrency;

  /** A cost in the subscription's currency, plus "≈ base" when it's billed in another one. */
  function cost(value: string, baseValue: string | null) {
    const own = formatCurrency(value, subscription.currency);
    if (!isForeign) return own;
    return baseValue === null ? `${own} (no exchange rate)` : `${own} ≈ ${formatCurrency(baseValue, baseCurrency)}`;
  }

  return (
    <>
      <div className={styles.statsRow}>
        <StatCard
          label="Price"
          value={`${formatCurrency(subscription.amount, subscription.currency)} / ${PERIOD_LABELS[subscription.frequency]}`}
        />
        <StatCard label="Monthly cost" value={cost(subscription.monthly_cost, subscription.base_monthly_cost)} />
        <StatCard label="Yearly cost" value={cost(subscription.yearly_cost, subscription.base_yearly_cost)} />
      </div>

      <div className={styles.cardsRow}>
        <DashboardCard title="Details">
          <dl className={styles.details}>
            <dt>Category</dt>
            <dd>{categoryName ?? "—"}</dd>
            <dt>Billing</dt>
            <dd>{FREQUENCY_LABELS[subscription.frequency]}</dd>
            <dt>Currency</dt>
            <dd>{subscription.currency}</dd>
            <dt>First payment</dt>
            <dd>{formatDate(subscription.start_date)}</dd>
            <dt>Last payment</dt>
            <dd>{subscription.end_date ? formatDate(subscription.end_date) : "Open-ended"}</dd>
            <dt>Next payment</dt>
            <dd>{subscription.next_payment_date ? formatDate(subscription.next_payment_date) : "—"}</dd>
            {subscription.description && (
              <>
                <dt>Notes</dt>
                <dd>{subscription.description}</dd>
              </>
            )}
          </dl>
        </DashboardCard>

        <DashboardCard title="Upcoming payments">
          {subscription.upcoming_payments.length === 0 ? (
            <p className={styles.muted}>
              {subscription.status === "paused" ? "Paused — no payments ahead." : "No payments ahead."}
            </p>
          ) : (
            <ul className={styles.schedule}>
              {subscription.upcoming_payments.map((date) => (
                <li key={date}>
                  <span>{formatDate(date)}</span>
                  <span className={styles.scheduleAmount}>
                    {formatCurrency(subscription.amount, subscription.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </div>
    </>
  );
}
