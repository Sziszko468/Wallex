import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * Refetches when the screen regains focus (e.g. back from an edit screen or a
 * modal). The first focus is skipped: mounting already loads the data.
 *
 * It always calls the *latest* `refetch`, so the request uses the screen's
 * current filters rather than the ones captured on the first render. The focus
 * effect itself never changes, so it doesn't run again merely because
 * something `refetch` depends on (like the selected month) changed — the data
 * hooks already refetch in that case.
 */
export function useRefetchOnFocus(refetch: () => unknown): void {
  const latestRefetch = useRef(refetch);
  latestRefetch.current = refetch;
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      void latestRefetch.current();
    }, [])
  );
}
