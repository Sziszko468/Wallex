import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches, updating live as the window changes.
 * `fallback` is used where matchMedia doesn't exist (tests) — pick the layout you want there.
 * Only for behaviour that CSS alone can't express (e.g. which navigation to mount).
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  // Stable functions: React re-subscribes whenever `subscribe` changes identity.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  const getSnapshot = useCallback(
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : fallback),
    [query, fallback]
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}
