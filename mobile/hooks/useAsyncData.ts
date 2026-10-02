import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { nextSyncTick } from "../utils/syncClock";
import { useSyncState } from "./useSync";
import { HTTP_STATUS } from "../config/http";

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: unknown;
}

interface AsyncDataOptions {
  /**
   * Reload in the background whenever the server's data changes (another device, or a write
   * elsewhere on this page). Default true. Turn it off for data an edit form was seeded from:
   * the form must keep the version the user started editing (and send it as If-Match).
   */
  live?: boolean;
}

function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === HTTP_STATUS.NOT_FOUND;
}

function sameData(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Runs `fetcher` on mount and whenever its identity changes (so callers
 * control refetching via useCallback deps, e.g. [year, month]). Discards
 * a response if a newer call has since started, so a slow request can
 * never clobber a faster, more recent one. `refetch` returns a Promise so
 * callers (e.g. pull-to-refresh) can await completion across several hooks.
 *
 * - `refetch()` reloads with a loading state (retry buttons, filters).
 * - `revalidate()` reloads silently: the current data stays on screen until the new data
 *   arrives, and unchanged data keeps its identity (no re-render, no form re-seeding).
 * - Live views revalidate by themselves when SyncProvider detects a server change, and when the
 *   interface language changes (the server writes some texts, such as insights, in it).
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, { live = true }: AsyncDataOptions = {}) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });
  const requestIdRef = useRef(0);
  const loadedAtRef = useRef(0);

  const run = useCallback(
    (silent: boolean): Promise<void> => {
      const requestId = ++requestIdRef.current;
      loadedAtRef.current = nextSyncTick();
      if (!silent) setState({ data: null, isLoading: true, error: null });
      return fetcher()
        .then((data) => {
          if (requestIdRef.current !== requestId) return;
          setState((previous) => ({
            data: previous.data !== null && sameData(previous.data, data) ? previous.data : data,
            isLoading: false,
            error: null,
          }));
        })
        .catch((error: unknown) => {
          if (requestIdRef.current !== requestId) return;
          // A silent reload that fails keeps what is on screen — unless the object is gone
          // (deleted on another device), which the view must show.
          if (!silent || isNotFound(error)) setState({ data: null, isLoading: false, error });
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetcher]
  );

  const refetch = useCallback(() => run(false), [run]);
  const revalidate = useCallback(() => run(true), [run]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const { i18n } = useTranslation();
  const language = i18n.language;
  const shownLanguage = useRef(language);
  useEffect(() => {
    if (shownLanguage.current === language) return;
    shownLanguage.current = language;
    if (live) void revalidate();
  }, [language, live, revalidate]);

  const sync = useSyncState();
  const syncVersion = sync?.version ?? 0;
  const detectedAt = sync?.detectedAt ?? 0;
  useEffect(() => {
    // Loaded after the change was detected: this view already has it.
    if (!live || syncVersion === 0 || loadedAtRef.current > detectedAt) return;
    void revalidate();
  }, [live, syncVersion, detectedAt, revalidate]);

  return { ...state, refetch, revalidate };
}
