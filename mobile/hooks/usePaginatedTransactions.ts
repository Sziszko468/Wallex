import { useCallback, useEffect, useRef, useState } from "react";
import { listTransactions } from "../services/transactionsService";
import type { Transaction } from "../types/transaction";

const PAGE_SIZE = 20;

interface UsePaginatedTransactionsParams {
  search: string;
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
}

/**
 * Infinite-scroll pagination over GET /api/transactions/. Unlike
 * useAsyncData, a filter change here REPLACES the list from page 1, but
 * loadMore() APPENDS further pages instead of resetting what's already
 * loaded — the two share one request-id guard so a slow, now-stale request
 * can never clobber a newer one.
 */
export function usePaginatedTransactions({
  search,
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

  const fetchPage = useCallback(
    async (pageToFetch: number, mode: "replace" | "append") => {
      const requestId = ++requestIdRef.current;
      if (mode === "replace") {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }
      try {
        const response = await listTransactions({
          search: search || undefined,
          category,
          date_from: dateFrom,
          date_to: dateTo,
          ordering: "-date",
          page: pageToFetch,
          page_size: PAGE_SIZE,
        });
        if (requestIdRef.current !== requestId) return;
        setTransactions((previous) =>
          mode === "replace" ? response.results : [...previous, ...response.results]
        );
        setCount(response.count);
        setPage(pageToFetch);
      } catch (fetchError) {
        if (requestIdRef.current !== requestId) return;
        setError(fetchError);
      } finally {
        if (requestIdRef.current !== requestId) return;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [search, category, dateFrom, dateTo]
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

  return { transactions, isLoading, isLoadingMore, error, hasMore, loadMore, refetch };
}
