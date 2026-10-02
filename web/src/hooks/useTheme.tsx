import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** What the user chose. "system" follows the operating system and keeps following it. */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** Must match public/theme-init.js, which applies the saved choice before first paint. */
export const THEME_STORAGE_KEY = "wallex-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
// The page background of each theme (tokens --color-bg), for the browser's address-bar colour.
const BROWSER_CHROME_COLOR: Record<ResolvedTheme, string> = { light: "#f4f2ea", dark: "#111412" };
const TRANSITION_CLASS = "theme-transition";
const TRANSITION_MS = 350;

function parsePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function readStoredPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system"; // storage blocked: follow the system, just don't remember anything
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

function resolve(preference: ThemePreference, systemIsDark: boolean): ResolvedTheme {
  if (preference === "system") return systemIsDark ? "dark" : "light";
  return preference;
}

/**
 * "system" sets no attribute: the stylesheet's prefers-color-scheme rule is in charge, so an
 * OS change is followed instantly with no JavaScript. Light/Dark pin the theme explicitly.
 */
function applyTheme(preference: ThemePreference, resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BROWSER_CHROME_COLOR[resolved]);
}

let transitionTimer: number | undefined;

/** Cross-fades the next theme change instead of snapping (skipped for reduced motion). */
function startThemeTransition() {
  if (typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
  const root = document.documentElement;
  root.classList.add(TRANSITION_CLASS);
  window.clearTimeout(transitionTimer);
  transitionTimer = window.setTimeout(() => root.classList.remove(TRANSITION_CLASS), TRANSITION_MS);
}

interface ThemeContextValue {
  preference: ThemePreference;
  /** What is actually showing right now — "system" resolved to light or dark. */
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemIsDark, setSystemIsDark] = useState(systemPrefersDark);

  // Follow the operating system (while "System" is chosen, that's what decides the theme).
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    function handleChange(event: MediaQueryListEvent) {
      setSystemIsDark(event.matches);
    }
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  // The preference was changed in another tab.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY) setPreferenceState(parsePreference(event.newValue));
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const resolvedTheme = resolve(preference, systemIsDark);

  useEffect(() => {
    applyTheme(preference, resolvedTheme);
  }, [preference, resolvedTheme]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      startThemeTransition();
      // Applied right away (not only in the effect) so the fade starts in the same frame.
      applyTheme(next, resolve(next, systemIsDark));
      setPreferenceState(next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Blocked storage: the choice lasts until the page is closed.
      }
    },
    [systemIsDark]
  );

  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [preference, resolvedTheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
