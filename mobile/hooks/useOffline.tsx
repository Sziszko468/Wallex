import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import { useAuth } from "./useAuth";
import { getCurrentUser } from "../services/authService";
import { getConnectivitySnapshot, subscribeConnectivity } from "../services/connectivity";
import {
  discardPending,
  enqueueTransaction,
  getOutboxSnapshot,
  loadOutbox,
  resetOutbox,
  retryPending,
  subscribeOutbox,
  syncOutbox,
  type PendingTransaction,
} from "../services/outbox";
import type { CreateTransactionPayload } from "../types/transaction";

// While something is pending (or the backend was unreachable), check again this often.
const RECHECK_INTERVAL_MS = 15_000;

interface OfflineContextValue {
  /** No network, or the backend didn't answer the last request. */
  isOffline: boolean;
  /** When the oldest cached data currently on screen was loaded (null = all live). */
  cacheServedAt: number | null;
  pendingTransactions: readonly PendingTransaction[];
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  /**
   * Bumped when server data changed under the screens (pending items synced,
   * or the connection came back): screens refetch when it changes.
   */
  dataVersion: number;
  saveOffline: (payload: CreateTransactionPayload) => Promise<void>;
  syncNow: () => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  discard: (clientId: string) => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const isSignedIn = status === "signedIn" && user !== null;

  const network = Network.useNetworkState();
  // Unknown (undefined) counts as online — requests themselves are the final word.
  const isDeviceOnline = network.isConnected !== false && network.isInternetReachable !== false;
  const connectivity = useSyncExternalStore(subscribeConnectivity, getConnectivitySnapshot);
  const isOffline = !isDeviceOnline || !connectivity.isApiReachable;

  const pendingTransactions = useSyncExternalStore(subscribeOutbox, getOutboxSnapshot);
  const pendingCount = pendingTransactions.filter((item) => item.status === "pending").length;
  const failedCount = pendingTransactions.length - pendingCount;

  const [isSyncing, setIsSyncing] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const syncNow = useCallback(async () => {
    // No network at all: trying would only push the items' backoff further out.
    if (!isSignedIn || !isDeviceOnline) return;
    setIsSyncing(true);
    try {
      const { synced } = await syncOutbox();
      // The backend is the source of truth: refetch so totals include the synced items.
      if (synced > 0) setDataVersion((version) => version + 1);
    } catch (error) {
      console.warn("Sync failed", error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSignedIn, isDeviceOnline]);

  // Back online → sync, and let screens replace cached data with live data.
  const wasOffline = useRef(isOffline);
  useEffect(() => {
    if (wasOffline.current && !isOffline) {
      setDataVersion((version) => version + 1);
      void syncNow();
    }
    wasOffline.current = isOffline;
  }, [isOffline, syncNow]);

  // The outbox belongs to one user (useAuth has already set the offline
  // namespace): load it on sign-in / app start, then sync what's due.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!isSignedIn) {
      resetOutbox();
      return;
    }
    loadOutbox()
      .then(() => syncNow())
      .catch((error: unknown) => console.warn("Failed to load pending transactions", error));
  }, [isSignedIn, userId, syncNow]);

  // Sync whenever the app returns to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow();
    });
    return () => subscription.remove();
  }, [syncNow]);

  // Periodic re-check: retries pending items once their backoff has passed, and
  // notices when the backend is back even if no screen is making requests.
  const needsRecheck = isSignedIn && isDeviceOnline && (pendingCount > 0 || !connectivity.isApiReachable);
  useEffect(() => {
    if (!needsRecheck) return;
    const timer = setInterval(() => {
      if (getOutboxSnapshot().some((item) => item.status === "pending")) {
        void syncNow();
      } else {
        getCurrentUser().catch(() => undefined); // any answer flips reachability
      }
    }, RECHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [needsRecheck, syncNow]);

  const saveOffline = useCallback(
    async (payload: CreateTransactionPayload) => {
      await enqueueTransaction(payload);
      if (!isOffline) void syncNow();
    },
    [isOffline, syncNow]
  );

  const retry = useCallback(
    async (clientId: string) => {
      await retryPending(clientId);
      await syncNow();
    },
    [syncNow]
  );

  const value = useMemo<OfflineContextValue>(
    () => ({
      isOffline,
      cacheServedAt: connectivity.cacheServedAt,
      pendingTransactions,
      pendingCount,
      failedCount,
      isSyncing,
      dataVersion,
      saveOffline,
      syncNow,
      retry,
      discard: discardPending,
    }),
    [
      isOffline,
      connectivity.cacheServedAt,
      pendingTransactions,
      pendingCount,
      failedCount,
      isSyncing,
      dataVersion,
      saveOffline,
      syncNow,
      retry,
    ]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOffline must be used within an OfflineProvider");
  }
  return context;
}

/** Calls `refetch` whenever server data may have changed under the screen (skips the first render). */
export function useRefetchOnDataChange(refetch: () => void): void {
  const { dataVersion } = useOffline();
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const firstVersion = useRef(dataVersion);
  useEffect(() => {
    if (dataVersion !== firstVersion.current) refetchRef.current();
  }, [dataVersion]);
}
