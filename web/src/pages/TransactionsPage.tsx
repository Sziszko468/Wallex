import { useCallback, useEffect, useMemo, useState } from "react";
import { listTransactions, deleteTransaction } from "../services/transactionsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import type { Category } from "../types/category";
import type { Transaction } from "../types/transaction";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { Pagination } from "../components/Pagination";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  TransactionFilters,
  emptyTransactionFilters,
  type TransactionFiltersValue,
} from "../components/transactions/TransactionFilters";
import { TransactionsTable } from "../components/transactions/TransactionsTable";
import { TransactionFormModal } from "../components/transactions/TransactionFormModal";
import { extractErrorMessage, isConflict, isNotFound } from "../utils/errors";
import styles from "./TransactionsPage.module.scss";

const PAGE_SIZE = 20;

interface FormModalState {
  isOpen: boolean;
  transaction: Transaction | null;
}

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFiltersValue>(emptyTransactionFilters);
  const [ordering, setOrdering] = useState("-date");
  const [page, setPage] = useState(1);
  const [formModal, setFormModal] = useState<FormModalState>({ isOpen: false, transaction: null });
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Deleted optimistically: hidden at once, shown again only if the server refuses.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<number>>(() => new Set());

  const debouncedSearch = useDebouncedValue(filters.search, 400);

  // Any change to what's being asked for should start back at page 1 —
  // otherwise a stricter filter can land the user on a now-nonexistent page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters.type, filters.category, filters.dateFrom, filters.dateTo, ordering]);

  const fetchTransactions = useCallback(
    () =>
      listTransactions({
        search: debouncedSearch || undefined,
        type: filters.type || undefined,
        category: filters.category ? Number(filters.category) : undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        ordering,
        page,
        page_size: PAGE_SIZE,
      }),
    [debouncedSearch, filters.type, filters.category, filters.dateFrom, filters.dateTo, ordering, page]
  );
  const transactions = useAsyncData(fetchTransactions);

  const fetchCategories = useCallback(() => listCategories(), []);
  const categories = useAsyncData(fetchCategories);

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    for (const category of categories.data ?? []) map.set(category.id, category);
    return map;
  }, [categories.data]);

  // If a delete emptied the current (non-first) page, step back a page
  // rather than showing a dead-end empty page.
  useEffect(() => {
    if (transactions.data && transactions.data.results.length === 0 && page > 1) {
      setPage((current) => current - 1);
    }
  }, [transactions.data, page]);

  function openCreateModal() {
    setFormModal({ isOpen: true, transaction: null });
  }

  function openEditModal(transaction: Transaction) {
    setFormModal({ isOpen: true, transaction });
  }

  function closeFormModal() {
    setFormModal({ isOpen: false, transaction: null });
  }

  function handleSaved() {
    closeFormModal();
    // Not optimistic: the server computes base_amount and the exchange rate. Reload in the
    // background so the table stays on screen.
    void transactions.revalidate();
  }

  function requestDelete(transaction: Transaction) {
    setDeleteError(null);
    setDeleteTarget(transaction);
  }

  function setRemoved(id: number, removed: boolean) {
    setRemovedIds((current) => {
      const next = new Set(current);
      if (removed) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Optimistic: a delete has nothing for the server to compute, so the row disappears at once.
  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setRemoved(target.id, true);
    try {
      await deleteTransaction(target.id, target.updated_at);
    } catch (error) {
      if (!isNotFound(error)) {
        // Refused: bring the row back. (404 = already deleted on another device: done anyway.)
        setRemoved(target.id, false);
        setDeleteError(
          isConflict(error)
            ? "This transaction was just changed on another device, so it wasn't deleted. Check the latest version and try again."
            : extractErrorMessage(error)
        );
      }
    }
    // Ids are never reused, so a deleted row can stay in removedIds after the reload.
    await transactions.revalidate();
  }

  const visibleTransactions = (transactions.data?.results ?? []).filter((row) => !removedIds.has(row.id));
  const hiddenCount = (transactions.data?.results.length ?? 0) - visibleTransactions.length;

  const deleteTargetLabel = deleteTarget
    ? deleteTarget.description || categoriesById.get(deleteTarget.category)?.name || "this transaction"
    : "";

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>Transactions</h1>
        <Button type="button" onClick={openCreateModal}>
          Add transaction
        </Button>
      </div>

      <TransactionFilters value={filters} categories={categories.data ?? []} onChange={setFilters} />

      <ErrorBanner message={deleteError} />

      {transactions.isLoading ? (
        <div className={styles.skeletonStack}>
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      ) : transactions.error ? (
        <ErrorState error={transactions.error} onRetry={transactions.refetch} />
      ) : (
        <>
          <TransactionsTable
            transactions={visibleTransactions}
            categoriesById={categoriesById}
            ordering={ordering}
            onSortChange={setOrdering}
            onEdit={openEditModal}
            onDelete={requestDelete}
          />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={(transactions.data?.count ?? 0) - hiddenCount}
            onPageChange={setPage}
          />
        </>
      )}

      <TransactionFormModal
        isOpen={formModal.isOpen}
        transaction={formModal.transaction}
        categories={categories.data ?? []}
        onClose={closeFormModal}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete transaction"
        message={`Delete "${deleteTargetLabel}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
