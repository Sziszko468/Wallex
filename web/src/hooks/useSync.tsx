import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSyncStatus } from "../services/syncService";
import { subscribeLocalWrites } from "../services/localWrites";
import { nextSyncTick, SYNC_POLL_INTERVAL_MS } from "../utils/syncClock";

export interface SyncState {
  /** Bumped every time the server's data changed (on any device, this one included). */
  version: number;
  /** Tick taken just before the status request that detected the change. */
  detectedAt: number;
}

interface SyncContextValue extends SyncState {
  /** Ask the server now (e.g. after a write). Never rejects. */
  checkNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * Keeps this browser tab in step with every other device of the account.
 *
 * All devices share one database through the API, so there is nothing to merge: when the
 * server's `version` (GET /api/sync/status/) changes, every view on screen reloads its data
 * in the background. The version is checked every 30 s while the tab is visible, when the
 * tab or window becomes active again, when the browser comes back online, and right after
 * this tab's own writes (see services/localWrites.ts).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SyncState>({ version: 0, detectedAt: 0 });
  const lastServerVersion = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const checkAgain = useRef(false);

  const runCheck = useCallback(async (): Promise<void> => {
    const startedAt = nextSyncTick();
    try {
      const { version } = await getSyncStatus();
      const previous = lastServerVersion.current;
      lastServerVersion.current = version;
      // The first answer counts too: a view that loaded before this check started (e.g. the
      // first check came late, after being offline) may predate a change. Views that loaded
      // after it skip the reload — see useAsyncData.
      if (version !== previous) {
        setState((current) => ({ version: current.version + 1, detectedAt: startedAt }));
      }
    } catch {
      // Offline or the server is down: the next trigger tries again. Views keep their data.
    }
  }, []);

  const checkNow = useCallback((): Promise<void> => {
    if (inFlight.current) {
      // A write may have landed after the running check read the version: look once more.
      checkAgain.current = true;
      return inFlight.current;
    }
    const run = async () => {
      do {
        checkAgain.current = false;
        await runCheck();
      } while (checkAgain.current);
      inFlight.current = null;
    };
    inFlight.current = run();
    return inFlight.current;
  }, [runCheck]);

  // The first check starts before the views on screen begin loading (they load in passive
  // effects, which React runs after every layout effect), so a normal page load reloads nothing.
  useLayoutEffect(() => {
    void checkNow();
  }, [checkNow]);

  useEffect(() => {
    const checkIfVisible = () => {
      if (document.visibilityState === "visible") void checkNow();
    };

    const timer = setInterval(checkIfVisible, SYNC_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", checkIfVisible);
    // Two windows side by side are both "visible": focus tells which one the user turned to.
    window.addEventListener("focus", checkIfVisible);
    window.addEventListener("online", checkIfVisible);
    const unsubscribe = subscribeLocalWrites(() => void checkNow());

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", checkIfVisible);
      window.removeEventListener("focus", checkIfVisible);
      window.removeEventListener("online", checkIfVisible);
      unsubscribe();
    };
  }, [checkNow]);

  const value = useMemo(() => ({ ...state, checkNow }), [state, checkNow]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** The sync state, or null outside a SyncProvider (e.g. isolated component tests). */
export function useSyncState(): SyncContextValue | null {
  return useContext(SyncContext);
}
