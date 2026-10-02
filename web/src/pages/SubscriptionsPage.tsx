import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EXCHANGE_RATE_MAX_AGE_DAYS, UPCOMING_PAYMENT_DAYS } from "../config/subscriptions";
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
  const { t } = useTranslation();
  usePageTitle(t("subscriptions.title"));
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
    toast.success(formModal.subscription ? t("subscriptions.toast.saved") : t("subscriptions.toast.added"));
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
      toast.success(t("subscriptions.toast.deleted"));
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
          title={t("subscriptions.empty.title")}
          message={t("subscriptions.empty.message")}
          action={
            <Button leadingIcon="plus" onClick={openCreate}>
              {t("subscriptions.add")}
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
        title={t("subscriptions.title")}
        description={t("subscriptions.description")}
        actions={
          <Button type="button" leadingIcon="plus" onClick={openCreate}>
            {t("subscriptions.add")}
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
              label: t("subscriptions.summary.monthly"),
              value: summary.data ? formatCurrency(summary.data.monthly_total, baseCurrency) : undefined,
              isLoading: summary.isLoading,
            },
            {
              label: t("subscriptions.summary.yearly"),
              value: summary.data ? formatCurrency(summary.data.yearly_total, baseCurrency) : undefined,
              isLoading: summary.isLoading,
            },
            {
              label: t("subscriptions.summary.active"),
              value: summary.data
                ? summary.data.paused_count
                  ? t("subscriptions.summary.activeWithPaused", { active: summary.data.active_count, paused: summary.data.paused_count })
                  : String(summary.data.active_count)
                : undefined,
              isLoading: summary.isLoading,
            },
          ]}
        />
      )}

      {unconverted.length > 0 && (
        <Notice tone="warning">
          {t("subscriptions.summary.unconverted", { currencies: unconverted.join(", "), days: EXCHANGE_RATE_MAX_AGE_DAYS })}
        </Notice>
      )}

      {renderList()}

      {summary.data && (
        <div className={styles.cardsRow}>
          <DashboardCard title={t("subscriptions.cards.upcoming", { days: UPCOMING_PAYMENT_DAYS })}>
            <UpcomingPaymentsList payments={summary.data.upcoming} baseCurrency={baseCurrency} />
          </DashboardCard>
          <DashboardCard title={t("subscriptions.cards.byCategory")}>
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
        title={t("subscriptions.delete.title")}
        message={t("subscriptions.delete.message", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("common.actions.delete")}
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
