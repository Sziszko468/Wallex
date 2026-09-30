/**
 * jsdom has no matchMedia. This installs a controllable one: tests can flip the operating
 * system's dark-mode preference and watch the app react, like a user changing it at sunset.
 * Width queries answer "desktop" (the sidebar layout) unless `desktop: false` asks for the phone layout.
 */
export function installMatchMedia({ dark = false, reducedMotion = false, desktop = true } = {}) {
  const state = { dark, reducedMotion };
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();

  function matches(query: string): boolean {
    if (query.includes("prefers-color-scheme: dark")) return state.dark;
    if (query.includes("prefers-reduced-motion")) return state.reducedMotion;
    return desktop && query.includes("min-width");
  }

  window.matchMedia = ((query: string) => ({
    media: query,
    get matches() {
      return matches(query);
    },
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      const set = listeners.get(query) ?? new Set();
      set.add(listener);
      listeners.set(query, set);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.get(query)?.delete(listener);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  return {
    /** The user switches the device between light and dark. */
    setSystemDark(value: boolean) {
      state.dark = value;
      const query = "(prefers-color-scheme: dark)";
      for (const listener of listeners.get(query) ?? []) {
        listener({ matches: value, media: query } as MediaQueryListEvent);
      }
    },
    uninstall() {
      // @ts-expect-error — restore jsdom's original (absent) implementation
      delete window.matchMedia;
    },
  };
}
