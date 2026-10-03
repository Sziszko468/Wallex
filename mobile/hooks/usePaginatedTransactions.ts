import { useCallback, useEffect, useRef, useState } from "react";
import { listTransactions } from "../services/transactionsService";
import type { TransactionType } from "../types/category";
import type { Transaction } from "../types/transaction";
import { nextSyncTick } from "../utils/syncClock";
import { useSyncState } from "./useSync";

const PAGE_SIZE = 20;
// The API's max_page_size: the most a background reload can refresh in one request.
const MAX_PAGE_SIZE = 100;

type FetchMode = "replace" | "append" | "revalidate";

interface UsePaginatedTransactionsParams {
  search: string;
  /** Only expenses or only income; omitted for both. */
  type?: TransactionType;
  category: number | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
}

interface UsePaginatedTransactionsResult {
  transactions: Transaction[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: unknown;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => Promise<void>;
  revalidate: () => Promise<void>;
}

/**
 * Infinite-scroll pagination over GET /api/transactions/. Unlike
 * useAsyncData, a filter change here REPLACES the list from page 1, but
 * loadMore() APPENDS further pages instead of resetting what's already
 * loaded — the modes share one request-id guard so a slow, now-stale request
 * can never clobber a newer one.
 *
 * Other devices write to the same account, so pages can shift between two
 * loads: a transaction added elsewhere pushes the last row of page 1 onto
 * page 2. Appending therefore skips rows already on screen. When SyncProvider
 * detects a change, `revalidate()` refreshes every row loaded so far in one
 * request (up to 100), keeping the list — and the scroll position — on screen.
 */
export function usePaginatedTransactions({
  search,
  type,
  category,
  dateFrom,
  dateTo,
}: UsePaginatedTransactionsParams): UsePaginatedTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestIdRef = useRef(0);
  const loadedAtRef = useRef(0);

  const fetchPage = useCallback(
    async (pageToFetch: number, mode: FetchMode, pageSize = PAGE_SIZE) => {
      const requestId = ++requestIdRef.current;
      loadedAtRef.current = nextSyncTick();
      if (mode === "replace") {
        setIsLoading(true);
        setError(null);
      } else if (mode === "append") {
        setIsLoadingMore(true);
      }
      try {
        const response = await listTransactions({
          search: search || undefined,
          type,
          category,
          date_from: dateFrom,
          date_to: dateTo,
          ordering: "-date",
          page: pageToFetch,
          page_size: pageSize,
        });
        if (requestIdRef.current !== requestId) return;
        setTransactions((previous) => {
          if (mode === "append") {
            const onScreen = new Set(previous.map((transaction) => transaction.id));
            return [...previous, ...response.results.filter((transaction) => !onScreen.has(transaction.id))];
          }
          const unchanged = mode === "revalidate" && JSON.stringify(previous) === JSON.stringify(response.results);
          return unchanged ? previous : response.results;
        });
        setCount(response.count);
        // A refreshed window of N rows = N / PAGE_SIZE pages; loadMore continues after it.
        setPage(mode === "revalidate" ? pageSize / PAGE_SIZE : pageToFetch);
        setError(null);
      } catch (fetchError) {
        if (requestIdRef.current !== requestId) return;
        // A failed background reload keeps the list that is on screen.
        if (mode !== "revalidate") setError(fetchError);
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [search, type, category, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchPage(1, "replace");
  }, [fetchPage]);

  const hasMore = transactions.length < count;

  function loadMore() {
    if (isLoading || isLoadingMore || !hasMore) return;
    fetchPage(page + 1, "append");
  }

  function refetch() {
    return fetchPage(1, "replace");
  }

  function revalidate() {
    const loadedPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
    return fetchPage(1, "revalidate", Math.min(MAX_PAGE_SIZE, loadedPages * PAGE_SIZE));
  }

  // Server data changed (another device, or this app's own write): refresh in the background.
  const sync = useSyncState();
  const syncVersion = sync?.version ?? 0;
  const detectedAt = sync?.detectedAt ?? 0;
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;
  useEffect(() => {
    if (syncVersion === 0 || loadedAtRef.current > detectedAt) return;
    void revalidateRef.current();
  }, [syncVersion, detectedAt]);

  return { transactions, isLoading, isLoadingMore, error, hasMore, loadMore, refetch, revalidate };
}
