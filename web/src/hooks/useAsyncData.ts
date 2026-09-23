import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: unknown;
}

/**
 * Runs `fetcher` on mount and whenever its identity changes (so callers
 * control refetching via useCallback deps, e.g. [year, month]). Discards
 * a response if a newer call has since started, so a slow request can
 * never clobber a faster, more recent one.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });
  const requestIdRef = useRef(0);

  const execute = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState({ data: null, isLoading: true, error: null });
    fetcher()
      .then((data) => {
        if (requestIdRef.current === requestId) setState({ data, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (requestIdRef.current === requestId) setState({ data: null, isLoading: false, error });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher]);

  useEffect(() => {
    execute();
  }, [execute]);

  return { ...state, refetch: execute };
}
