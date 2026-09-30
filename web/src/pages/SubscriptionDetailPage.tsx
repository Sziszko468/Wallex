import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteSubscription, getSubscription } from "../services/subscriptionsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { usePageTitle } from "../hooks/usePageTitle";
import type { Subscription } from "../types/subscription";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { DetailList } from "../components/DetailList";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { SummaryStrip } from "../components/SummaryStrip";
import { useToast } from "../components/Toast";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { SubscriptionFormModal } from "../components/subscriptions/SubscriptionFormModal";
import { SubscriptionStatusBadge } from "../components/subscriptions/SubscriptionStatusBadge";
import { extractErrorMessage } from "../utils/errors";
import { formatCurrency, formatDate } from "../utils/format";
import { FREQUENCY_LABELS, PERIOD_LABELS } from "../utils/subscriptions";
import pageStyles from "../components/page.module.scss";
import styles from "./SubscriptionDetailPage.module.scss";

const BACK_LINK = { to: "/subscriptions", label: "All subscriptions" };

export function SubscriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const subscriptionId = Number(id);

  const fetchSubscription = useCallback(() => getSubscription(subscriptionId), [subscriptionId]);
  const subscription = useAsyncData(fetchSubscription);
  usePageTitle(subscription.data?.name ?? "Subscription");

  const fetchCategories = useCallback(() => listCategories(), []);
  const categories = useAsyncData(fetchCategories);

  // Snapshot taken when Edit is pressed: a background reload must not re-seed the open form.
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function confirmDelete() {
    setIsDeleting(true);
    try {
      await deleteSubscription(subscriptionId);
      toast.success("Subscription deleted");
      navigate("/subscriptions", { replace: true });
    } catch (error) {
      setActionError(extractErrorMessage(error));
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  }

  function handleSaved() {
    toast.success("Changes saved");
    setEditing(null);
    subscription.refetch();
  }

  const category = useMemo(
    () => categories.data?.find((item) => item.id === subscription.data?.category),
    [categories.data, subscription.data]
  );

  const data = subscription.data;

  function renderBody() {
    if (subscription.isLoading) return <Skeleton height={320} borderRadius={16} />;
    if (subscription.error || !data) return <ErrorState error={subscription.error} onRetry={subscription.refetch} />;
    return <SubscriptionDetails subscription={data} categoryName={category?.name} />;
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        backTo={BACK_LINK}
        title={
          data ? (
            <span className={styles.title}>
              {data.name} <SubscriptionStatusBadge status={data.status} />
            </span>
          ) : (
            "Subscription"
          )
        }
        description={data?.merchant || undefined}
        actions={
          data && (
            <>
              <Button type="button" variant="secondary" leadingIcon="pencil" onClick={() => setEditing(data)}>
                Edit
              </Button>
              <Button type="button" variant="danger-quiet" leadingIcon="trash" onClick={() => setIsConfirmingDelete(true)}>
                Delete
              </Button>
            </>
          )
        }
      />

      <ErrorBanner message={actionError} />

      {renderBody()}

      <SubscriptionFormModal
        isOpen={editing !== null}
        subscription={editing}
        categories={categories.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Delete subscription"
        message={`Delete "${data?.name ?? ""}"? Payments you already recorded stay in your transactions.`}
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

  const details = [
    { label: "Category", value: categoryName ?? "—" },
    { label: "Billing", value: FREQUENCY_LABELS[subscription.frequency] },
    { label: "Currency", value: subscription.currency },
    { label: "First payment", value: formatDate(subscription.start_date) },
    { label: "Last payment", value: subscription.end_date ? formatDate(subscription.end_date) : "Open-ended" },
    { label: "Next payment", value: subscription.next_payment_date ? formatDate(subscription.next_payment_date) : "—" },
    ...(subscription.description ? [{ label: "Notes", value: subscription.description }] : []),
  ];

  return (
    <>
      <SummaryStrip
        items={[
          {
            label: "Price",
            value: `${formatCurrency(subscription.amount, subscription.currency)} / ${PERIOD_LABELS[subscription.frequency]}`,
          },
          { label: "Monthly cost", value: cost(subscription.monthly_cost, subscription.base_monthly_cost) },
          { label: "Yearly cost", value: cost(subscription.yearly_cost, subscription.base_yearly_cost) },
        ]}
      />

      <div className={styles.cardsRow}>
        <DashboardCard title="Details">
          <DetailList items={details} />
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
