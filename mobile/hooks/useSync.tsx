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
import { AppState } from "react-native";
import { getSyncStatus } from "../services/syncService";
import { subscribeLocalWrites } from "../services/localWrites";
import { nextSyncTick, SYNC_POLL_INTERVAL_MS } from "../utils/syncClock";
import { useOffline } from "./useOffline";

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
 * Keeps this phone in step with the account's other devices (the web app, another phone).
 *
 * All devices share one database through the API, so there is nothing to merge: when the
 * server's `version` (GET /api/sync/status/) changes, every screen that is mounted reloads
 * its data in the background. The version is checked when the app starts, every 30 s while
 * it is in the foreground, when it returns to the foreground, when the connection comes
 * back, and right after this app's own writes. Offline, nothing is checked — the offline
 * cache and outbox (useOffline) take over, and the server is asked again once back online.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { isOffline } = useOffline();
  const isOfflineRef = useRef(isOffline);
  isOfflineRef.current = isOffline;

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
      // first check came late, after being offline or in the background) may predate a change. Views that loaded
      // after it skip the reload — see useAsyncData.
      if (version !== previous) {
        setState((current) => ({ version: current.version + 1, detectedAt: startedAt }));
      }
    } catch {
      // Unreachable: the next trigger tries again. Screens keep their data.
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

  // The first check starts before the screens begin loading (they load in passive effects,
  // which React runs after every layout effect), so a normal start reloads nothing. It runs
  // even if the app starts in the background: it only fixes the starting point.
  useLayoutEffect(() => {
    if (!isOfflineRef.current) void checkNow();
  }, [checkNow]);

  useEffect(() => {
    const checkIfForeground = () => {
      if (AppState.currentState === "active" && !isOfflineRef.current) void checkNow();
    };

    const timer = setInterval(checkIfForeground, SYNC_POLL_INTERVAL_MS);
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") checkIfForeground();
    });
    const unsubscribe = subscribeLocalWrites(() => void checkNow());

    return () => {
      clearInterval(timer);
      appState.remove();
      unsubscribe();
    };
  }, [checkNow]);

  // Back online: the other devices may have changed things meanwhile.
  const wasOffline = useRef(isOffline);
  useEffect(() => {
    if (wasOffline.current && !isOffline) void checkNow();
    wasOffline.current = isOffline;
  }, [isOffline, checkNow]);

  const value = useMemo(() => ({ ...state, checkNow }), [state, checkNow]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** The sync state, or null outside a SyncProvider (e.g. isolated component tests). */
export function useSyncState(): SyncContextValue | null {
  return useContext(SyncContext);
}
