import { useCallback, useMemo, useState } from "react";
import {
  deleteRecurringTransaction,
  listRecurringTransactions,
  updateRecurringTransaction,
} from "../services/recurringTransactionsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageTitle } from "../hooks/usePageTitle";
import type { Category } from "../types/category";
import type { RecurringTransaction } from "../types/recurringTransaction";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { SkeletonRows } from "../components/Skeleton";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { RecurringList } from "../components/recurring/RecurringList";
import { RecurringTransactionFormModal } from "../components/recurring/RecurringTransactionFormModal";
import { extractErrorMessage } from "../utils/errors";
import styles from "../components/page.module.scss";

interface FormModalState {
  isOpen: boolean;
  item: RecurringTransaction | null;
}

export function RecurringTransactionsPage() {
  usePageTitle("Recurring");
  const toast = useToast();
  const fetchItems = useCallback(() => listRecurringTransactions(), []);
  const items = useAsyncData(fetchItems);

  const fetchCategories = useCallback(() => listCategories(), []);
  const categories = useAsyncData(fetchCategories);

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    for (const category of categories.data ?? []) map.set(category.id, category);
    return map;
  }, [categories.data]);

  const [formModal, setFormModal] = useState<FormModalState>({ isOpen: false, item: null });
  const [deleteTarget, setDeleteTarget] = useState<RecurringTransaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  function openCreateModal() {
    setFormModal({ isOpen: true, item: null });
  }

  function openEditModal(item: RecurringTransaction) {
    setFormModal({ isOpen: true, item });
  }

  function closeFormModal() {
    setFormModal({ isOpen: false, item: null });
  }

  function handleSaved() {
    toast.success(formModal.item ? "Changes saved" : "Recurring transaction added");
    closeFormModal();
    items.refetch();
  }

  function requestDelete(item: RecurringTransaction) {
    setActionError(null);
    setDeleteTarget(item);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteRecurringTransaction(deleteTarget.id);
      setDeleteTarget(null);
      toast.success("Recurring transaction deleted");
      items.refetch();
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleToggleActive(item: RecurringTransaction) {
    setActionError(null);
    setTogglingId(item.id);
    try {
      await updateRecurringTransaction(item.id, { is_active: !item.is_active });
      items.refetch();
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setTogglingId(null);
    }
  }

  const isLoading = items.isLoading || categories.isLoading;
  const error = items.error ?? categories.error;

  function renderContent() {
    if (isLoading) return <SkeletonRows count={5} rowHeight={68} />;
    if (error) return <ErrorState error={error} onRetry={items.refetch} />;
    if ((items.data ?? []).length === 0) {
      return (
        <EmptyState
          icon="recurring"
          title="No recurring transactions yet"
          message="Add rent, your salary or regular bills to keep track of everything that repeats."
          action={
            <Button leadingIcon="plus" onClick={openCreateModal}>
              Add recurring transaction
            </Button>
          }
        />
      );
    }
    return (
      <RecurringList
        items={items.data ?? []}
        categoriesById={categoriesById}
        onEdit={openEditModal}
        onDelete={requestDelete}
        onToggleActive={handleToggleActive}
        togglingId={togglingId}
      />
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Recurring transactions"
        description="Income and payments that repeat on a schedule."
        actions={
          <Button type="button" leadingIcon="plus" onClick={openCreateModal}>
            Add recurring transaction
          </Button>
        }
      />

      <ErrorBanner message={actionError} />

      {renderContent()}

      <RecurringTransactionFormModal
        isOpen={formModal.isOpen}
        item={formModal.item}
        categories={categories.data ?? []}
        onClose={closeFormModal}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete recurring transaction"
        message={`Delete "${deleteTarget?.name ?? ""}"? This can't be undone.`}
        confirmLabel="Delete"
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
