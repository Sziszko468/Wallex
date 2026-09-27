import { useCallback, useMemo, useState } from "react";
import { deleteSubscription, getSubscriptionSummary, listSubscriptions } from "../services/subscriptionsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import type { Category } from "../types/category";
import type { Subscription } from "../types/subscription";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { StatCard } from "../components/dashboard/StatCard";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { SubscriptionsTable } from "../components/subscriptions/SubscriptionsTable";
import { SubscriptionFormModal } from "../components/subscriptions/SubscriptionFormModal";
import { UpcomingPaymentsList } from "../components/subscriptions/UpcomingPaymentsList";
import { SubscriptionCategoryList } from "../components/subscriptions/SubscriptionCategoryList";
import { extractErrorMessage } from "../utils/errors";
import { formatCurrency } from "../utils/format";
import styles from "./SubscriptionsPage.module.scss";

const FALLBACK_CATEGORY_COLOR = "#9ca3af";

interface FormModalState {
  isOpen: boolean;
  subscription: Subscription | null;
}

export function SubscriptionsPage() {
  const baseCurrency = useBaseCurrency();

  const fetchSubscriptions = useCallback(() => listSubscriptions(), []);
  const subscriptions = useAsyncData(fetchSubscriptions);

  const fetchSummary = useCallback(() => getSubscriptionSummary(), []);
  const summary = useAsyncData(fetchSummary);

  const fetchCategories = useCallback(() => listCategories(), []);
  const categories = useAsyncData(fetchCategories);

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    for (const category of categories.data ?? []) map.set(category.id, category);
    return map;
  }, [categories.data]);

  const colorFor = useCallback(
    (categoryId: number) => categoriesById.get(categoryId)?.color ?? FALLBACK_CATEGORY_COLOR,
    [categoriesById]
  );

  const [formModal, setFormModal] = useState<FormModalState>({ isOpen: false, subscription: null });
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Costs, totals and upcoming payments all change together: reload both after any write.
  const { refetch: refetchSubscriptions } = subscriptions;
  const { refetch: refetchSummary } = summary;
  const reload = useCallback(() => {
    refetchSubscriptions();
    refetchSummary();
  }, [refetchSubscriptions, refetchSummary]);

  function closeFormModal() {
    setFormModal({ isOpen: false, subscription: null });
  }

  function handleSaved() {
    closeFormModal();
    reload();
  }

  function requestDelete(subscription: Subscription) {
    setActionError(null);
    setDeleteTarget(subscription);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSubscription(deleteTarget.id);
      setDeleteTarget(null);
      reload();
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  }

  const listIsLoading = subscriptions.isLoading || categories.isLoading;
  const listError = subscriptions.error ?? categories.error;
  const unconverted = summary.data?.unconverted_currencies ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>Subscriptions</h1>
        <Button type="button" onClick={() => setFormModal({ isOpen: true, subscription: null })}>
          Add subscription
        </Button>
      </div>

      <ErrorBanner message={actionError} />

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={summary.refetch} />
      ) : (
        <div className={styles.statsRow}>
          <StatCard
            label="Monthly subscriptions"
            value={summary.data ? formatCurrency(summary.data.monthly_total, baseCurrency) : undefined}
            isLoading={summary.isLoading}
          />
          <StatCard
            label="Yearly projection"
            value={summary.data ? formatCurrency(summary.data.yearly_total, baseCurrency) : undefined}
            isLoading={summary.isLoading}
          />
          <StatCard
            label="Active subscriptions"
            value={
              summary.data
                ? `${summary.data.active_count}${summary.data.paused_count ? ` · ${summary.data.paused_count} paused` : ""}`
                : undefined
            }
            isLoading={summary.isLoading}
          />
        </div>
      )}

      {unconverted.length > 0 && (
        <p className={styles.notice} role="status">
          Not included in the totals: subscriptions billed in {unconverted.join(", ")} — no exchange rate from the
          last 7 days.
        </p>
      )}

      {listIsLoading ? (
        <Skeleton height={220} borderRadius={8} />
      ) : listError ? (
        <ErrorState error={listError} onRetry={subscriptions.refetch} />
      ) : (
        <SubscriptionsTable
          subscriptions={subscriptions.data ?? []}
          categoriesById={categoriesById}
          onEdit={(subscription) => setFormModal({ isOpen: true, subscription })}
          onDelete={requestDelete}
        />
      )}

      {summary.data && (
        <div className={styles.cardsRow}>
          <DashboardCard title="Next 30 days">
            <UpcomingPaymentsList payments={summary.data.upcoming} baseCurrency={baseCurrency} />
          </DashboardCard>
          <DashboardCard title="Monthly cost by category">
            <SubscriptionCategoryList
              categories={summary.data.by_category}
              baseCurrency={baseCurrency}
              colorFor={colorFor}
            />
          </DashboardCard>
        </div>
      )}

      <SubscriptionFormModal
        isOpen={formModal.isOpen}
        subscription={formModal.subscription}
        categories={categories.data ?? []}
        onClose={closeFormModal}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete subscription"
        message={`Delete "${deleteTarget?.name ?? ""}"? Payments you already recorded stay in your transactions. To keep its history, set a last payment date instead.`}
        confirmLabel="Delete"
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
