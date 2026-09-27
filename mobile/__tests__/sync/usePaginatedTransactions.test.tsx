/**
 * The infinite-scroll list while other devices write to the same account: pages shift under
 * it, and a background refresh must keep what's on screen (and the scroll position).
 */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { usePaginatedTransactions } from "../../hooks/usePaginatedTransactions";
import { SyncProvider } from "../../hooks/useSync";
import { notifyLocalWrite } from "../../services/localWrites";
import { getSyncStatus } from "../../services/syncService";
import { listTransactions } from "../../services/transactionsService";
import type { SyncStatus } from "../../types/sync";
import type { Transaction, TransactionListParams } from "../../types/transaction";

jest.mock("../../services/transactionsService", () => ({ listTransactions: jest.fn() }));
jest.mock("../../services/syncService", () => ({ getSyncStatus: jest.fn() }));
jest.mock("../../hooks/useOffline", () => ({ useOffline: () => ({ isOffline: false }) }));

const mockedList = listTransactions as jest.MockedFunction<typeof listTransactions>;
const mockedStatus = getSyncStatus as jest.MockedFunction<typeof getSyncStatus>;

function transaction(id: number): Transaction {
  return {
    id,
    amount: "10.00",
    currency: "EUR",
    exchange_rate: "1.0000000000",
    base_amount: "10.00",
    type: "expense",
    category: 1,
    description: `Transaction ${id}`,
    date: "2026-09-20",
    client_id: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
  };
}

/** The server's list, newest first: 45 transactions (ids 45 … 1). */
let rows: Transaction[];
const requests: TransactionListParams[] = [];

const filters = { search: "", category: undefined, dateFrom: undefined, dateTo: undefined };

function ids(list: Transaction[]) {
  return list.map((item) => item.id);
}

beforeEach(() => {
  rows = Array.from({ length: 45 }, (_, index) => transaction(45 - index));
  requests.length = 0;
  mockedList.mockReset().mockImplementation(async (params = {}) => {
    requests.push(params);
    const size = params.page_size ?? 20;
    const start = ((params.page ?? 1) - 1) * size;
    return { count: rows.length, next: null, previous: null, results: rows.slice(start, start + size) };
  });
});

async function loadTwoPages() {
  const hook = await renderHook(() => usePaginatedTransactions(filters));
  await waitFor(() => expect(hook.result.current.transactions).toHaveLength(20));
  await act(async () => hook.result.current.loadMore());
  await waitFor(() => expect(hook.result.current.transactions).toHaveLength(40));
  return hook;
}

describe("usePaginatedTransactions with other devices writing", () => {
  it("never shows a row twice when a new transaction pushes the pages down", async () => {
    const hook = await renderHook(() => usePaginatedTransactions(filters));
    await waitFor(() => expect(hook.result.current.transactions).toHaveLength(20)); // 45 … 26

    rows.unshift(transaction(46)); // added on the web: row 26 moves to page 2
    await act(async () => hook.result.current.loadMore());

    await waitFor(() => expect(hook.result.current.isLoadingMore).toBe(false));
    const shown = ids(hook.result.current.transactions);
    expect(new Set(shown).size).toBe(shown.length);
    expect(shown).toHaveLength(39); // 45 … 7: row 26 once
  });

  it("refreshes every loaded row in one request, without a spinner, and scrolling continues after them", async () => {
    const hook = await loadTwoPages();
    rows.unshift(transaction(46)); // added on the web
    rows = rows.filter((item) => item.id !== 30); // deleted elsewhere
    const loadingStates: boolean[] = [];

    await act(async () => {
      const refresh = hook.result.current.revalidate();
      loadingStates.push(hook.result.current.isLoading);
      await refresh;
    });

    expect(requests.at(-1)).toMatchObject({ page: 1, page_size: 40 });
    expect(loadingStates).toEqual([false]);
    const shown = ids(hook.result.current.transactions);
    expect(shown.slice(0, 2)).toEqual([46, 45]);
    expect(shown).not.toContain(30);
    expect(shown).toHaveLength(40);

    await act(async () => hook.result.current.loadMore());
    expect(requests.at(-1)).toMatchObject({ page: 3, page_size: 20 });
  });

  it("keeps the list when a background refresh fails", async () => {
    const hook = await loadTwoPages();
    mockedList.mockRejectedValueOnce(new Error("Network Error"));

    await act(async () => hook.result.current.revalidate());

    expect(hook.result.current.transactions).toHaveLength(40);
    expect(hook.result.current.error).toBeNull();
  });

  it("refreshes by itself when SyncProvider sees a change", async () => {
    // The React Native jest preset mocks AppState as a plain object: mark the app as in the foreground.
    (AppState as { currentState: AppStateStatus }).currentState = "active";
    let version = "v1";
    mockedStatus.mockReset().mockImplementation(async () => ({ version }) as SyncStatus);
    const wrapper = ({ children }: { children: ReactNode }) => <SyncProvider>{children}</SyncProvider>;
    const hook = await renderHook(() => usePaginatedTransactions(filters), { wrapper });
    await waitFor(() => expect(hook.result.current.transactions).toHaveLength(20));
    await waitFor(() => expect(mockedStatus).toHaveBeenCalledTimes(1));

    rows.unshift(transaction(46));
    version = "v2";
    await act(async () => notifyLocalWrite());

    await waitFor(() => expect(hook.result.current.transactions[0]?.id).toBe(46));
  });
});
