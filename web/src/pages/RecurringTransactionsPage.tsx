import { useCallback, useMemo, useState } from "react";
import {
  deleteRecurringTransaction,
  listRecurringTransactions,
  updateRecurringTransaction,
} from "../services/recurringTransactionsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import type { Category } from "../types/category";
import type { RecurringTransaction } from "../types/recurringTransaction";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RecurringTransactionsTable } from "../components/recurring/RecurringTransactionsTable";
import { RecurringTransactionFormModal } from "../components/recurring/RecurringTransactionFormModal";
import { extractErrorMessage } from "../utils/errors";
import styles from "./RecurringTransactionsPage.module.scss";

interface FormModalState {
  isOpen: boolean;
  item: RecurringTransaction | null;
}

export function RecurringTransactionsPage() {
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

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>Recurring Transactions</h1>
        <Button type="button" onClick={openCreateModal}>
          Add recurring transaction
        </Button>
      </div>

      <ErrorBanner message={actionError} />

      {isLoading ? (
        <Skeleton height={220} borderRadius={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={items.refetch} />
      ) : (
        <RecurringTransactionsTable
          items={items.data ?? []}
          categoriesById={categoriesById}
          onEdit={openEditModal}
          onDelete={requestDelete}
          onToggleActive={handleToggleActive}
          togglingId={togglingId}
        />
      )}

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
