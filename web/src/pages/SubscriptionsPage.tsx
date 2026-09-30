import { useCallback, useMemo, useState } from "react";
import { deleteSubscription, getSubscriptionSummary, listSubscriptions } from "../services/subscriptionsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { usePageTitle } from "../hooks/usePageTitle";
import type { Category } from "../types/category";
import type { Subscription } from "../types/subscription";
import { FALLBACK_CATEGORY_COLOR } from "../utils/categoryStyle";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Notice } from "../components/Notice";
import { PageHeader } from "../components/PageHeader";
import { SkeletonRows } from "../components/Skeleton";
import { SummaryStrip } from "../components/SummaryStrip";
import { useToast } from "../components/Toast";
import { DashboardCard } from "../components/dashboard/DashboardCard";
import { SubscriptionsList } from "../components/subscriptions/SubscriptionsList";
import { SubscriptionFormModal } from "../components/subscriptions/SubscriptionFormModal";
import { UpcomingPaymentsList } from "../components/subscriptions/UpcomingPaymentsList";
import { SubscriptionCategoryList } from "../components/subscriptions/SubscriptionCategoryList";
import { extractErrorMessage } from "../utils/errors";
import { formatCurrency } from "../utils/format";
import pageStyles from "../components/page.module.scss";
import styles from "./SubscriptionsPage.module.scss";

interface FormModalState {
  isOpen: boolean;
  subscription: Subscription | null;
}

export function SubscriptionsPage() {
  usePageTitle("Subscriptions");
  const baseCurrency = useBaseCurrency();
  const toast = useToast();

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
    toast.success(formModal.subscription ? "Changes saved" : "Subscription added");
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
      toast.success("Subscription deleted");
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
  const openCreate = () => setFormModal({ isOpen: true, subscription: null });

  function renderList() {
    if (listIsLoading) return <SkeletonRows count={4} rowHeight={72} />;
    if (listError) return <ErrorState error={listError} onRetry={subscriptions.refetch} />;
    if ((subscriptions.data ?? []).length === 0) {
      return (
        <EmptyState
          icon="subscriptions"
          title="No subscriptions yet"
          message="Add Netflix, Spotify, your gym or phone plan to see what they really cost over a year."
          action={
            <Button leadingIcon="plus" onClick={openCreate}>
              Add subscription
            </Button>
          }
        />
      );
    }
    return (
      <SubscriptionsList
        subscriptions={subscriptions.data ?? []}
        categoriesById={categoriesById}
        onEdit={(subscription) => setFormModal({ isOpen: true, subscription })}
        onDelete={requestDelete}
      />
    );
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Subscriptions"
        description="What you pay for regularly, and what it adds up to."
        actions={
          <Button type="button" leadingIcon="plus" onClick={openCreate}>
            Add subscription
          </Button>
        }
      />

      <ErrorBanner message={actionError} />

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={summary.refetch} />
      ) : (
        <SummaryStrip
          items={[
            {
              label: "Monthly subscriptions",
              value: summary.data ? formatCurrency(summary.data.monthly_total, baseCurrency) : undefined,
              isLoading: summary.isLoading,
            },
            {
              label: "Yearly projection",
              value: summary.data ? formatCurrency(summary.data.yearly_total, baseCurrency) : undefined,
              isLoading: summary.isLoading,
            },
            {
              label: "Active subscriptions",
              value: summary.data
                ? `${summary.data.active_count}${summary.data.paused_count ? ` · ${summary.data.paused_count} paused` : ""}`
                : undefined,
              isLoading: summary.isLoading,
            },
          ]}
        />
      )}

      {unconverted.length > 0 && (
        <Notice tone="warning">
          Not included in the totals: subscriptions billed in {unconverted.join(", ")} — no exchange rate from the
          last 7 days.
        </Notice>
      )}

      {renderList()}

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
