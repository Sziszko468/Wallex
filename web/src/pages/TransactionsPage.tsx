import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listTransactions, deleteTransaction } from "../services/transactionsService";
import { listCategories } from "../services/categoriesService";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePageTitle } from "../hooks/usePageTitle";
import type { Category } from "../types/category";
import type { Transaction } from "../types/transaction";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { SkeletonRows } from "../components/Skeleton";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import {
  TransactionFilters,
  emptyTransactionFilters,
  type TransactionFiltersValue,
} from "../components/transactions/TransactionFilters";
import { TransactionList } from "../components/transactions/TransactionList";
import { TransactionDetailDrawer } from "../components/transactions/TransactionDetailDrawer";
import { TransactionFormModal } from "../components/transactions/TransactionFormModal";
import { extractErrorMessage, isConflict, isNotFound } from "../utils/errors";
import styles from "../components/page.module.scss";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;
const LOADING_ROWS = 6;
const LOADING_ROW_HEIGHT = 64;

interface FormModalState {
  isOpen: boolean;
  transaction: Transaction | null;
}

export function TransactionsPage() {
  const { t } = useTranslation();
  usePageTitle(t("transactions.title"));
  const toast = useToast();
  const [filters, setFilters] = useState<TransactionFiltersValue>(emptyTransactionFilters);
  const [ordering, setOrdering] = useState("-date");
  const [page, setPage] = useState(1);
  const [formModal, setFormModal] = useState<FormModalState>({ isOpen: false, transaction: null });
  // The transaction whose details are open in the drawer.
  const [detailTarget, setDetailTarget] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Deleted optimistically: hidden at once, shown again only if the server refuses.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<number>>(() => new Set());

  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);

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
    setDetailTarget(null);
    setFormModal({ isOpen: true, transaction });
  }

  function closeFormModal() {
    setFormModal({ isOpen: false, transaction: null });
  }

  function handleSaved() {
    toast.success(formModal.transaction ? t("transactions.toast.saved") : t("transactions.toast.added"));
    closeFormModal();
    // Not optimistic: the server computes base_amount and the exchange rate. Reload in the
    // background so the list stays on screen.
    void transactions.revalidate();
  }

  function requestDelete(transaction: Transaction) {
    setDetailTarget(null);
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
      toast.success(t("transactions.toast.deleted"));
    } catch (error) {
      if (!isNotFound(error)) {
        // Refused: bring the row back. (404 = already deleted on another device: done anyway.)
        setRemoved(target.id, false);
        setDeleteError(isConflict(error) ? t("transactions.delete.conflict") : extractErrorMessage(error));
      }
    }
    // Ids are never reused, so a deleted row can stay in removedIds after the reload.
    await transactions.revalidate();
  }

  const visibleTransactions = (transactions.data?.results ?? []).filter((row) => !removedIds.has(row.id));
  const hiddenCount = (transactions.data?.results.length ?? 0) - visibleTransactions.length;
  const hasActiveFilters = Object.values(filters).some(Boolean);
  // Days only make sense as groups while the list is in date order.
  const isChronological = ordering === "-date" || ordering === "date";

  const deleteTargetLabel = deleteTarget
    ? deleteTarget.description || categoriesById.get(deleteTarget.category)?.name || t("transactions.thisTransaction")
    : "";

  function renderResults() {
    if (transactions.isLoading) return <SkeletonRows count={LOADING_ROWS} rowHeight={LOADING_ROW_HEIGHT} />;
    if (transactions.error) return <ErrorState error={transactions.error} onRetry={transactions.refetch} />;

    if (visibleTransactions.length === 0 && page === 1) {
      return hasActiveFilters ? (
        <EmptyState
          icon="search"
          title={t("transactions.empty.filteredTitle")}
          message={t("transactions.empty.filteredMessage")}
          action={
            <Button variant="secondary" onClick={() => setFilters(emptyTransactionFilters)}>
              {t("transactions.filters.clear")}
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon="receipt"
          title={t("transactions.empty.title")}
          message={t("transactions.empty.message")}
          action={
            <Button leadingIcon="plus" onClick={openCreateModal}>
              {t("transactions.add")}
            </Button>
          }
        />
      );
    }

    return (
      <>
        <TransactionList
          transactions={visibleTransactions}
          categoriesById={categoriesById}
          groupByDay={isChronological}
          onOpen={setDetailTarget}
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
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("transactions.title")}
        description={t("transactions.description")}
        actions={
          <Button type="button" leadingIcon="plus" onClick={openCreateModal}>
            {t("transactions.add")}
          </Button>
        }
      />

      <TransactionFilters
        value={filters}
        categories={categories.data ?? []}
        ordering={ordering}
        onChange={setFilters}
        onOrderingChange={setOrdering}
      />

      <ErrorBanner message={deleteError} />

      {renderResults()}

      <TransactionDetailDrawer
        transaction={detailTarget}
        category={detailTarget ? categoriesById.get(detailTarget.category) : undefined}
        onClose={() => setDetailTarget(null)}
        onEdit={openEditModal}
        onDelete={requestDelete}
      />

      <TransactionFormModal
        isOpen={formModal.isOpen}
        transaction={formModal.transaction}
        categories={categories.data ?? []}
        onClose={closeFormModal}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={t("transactions.delete.title")}
        message={t("common.confirm.deleteMessage", { name: deleteTargetLabel })}
        confirmLabel={t("common.actions.delete")}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
