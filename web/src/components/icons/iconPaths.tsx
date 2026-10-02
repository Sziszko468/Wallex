import type { ReactNode } from "react";

/**
 * WALLEX's icon set: one style for the whole app — 24×24 grid, 1.75px rounded strokes,
 * no fills (except the three dots of "more"). Drawn in-house, so the app ships no icon library.
 * Add an icon by adding its name to ICON_NAMES and its geometry below; <Icon> does the rest.
 */
export const ICON_NAMES = [
  // Navigation
  "dashboard",
  "transactions",
  "budgets",
  "goals",
  "subscriptions",
  "recurring",
  "achievements",
  "assistant",
  "categories",
  "import",
  "settings",
  "security",
  // Actions & interface
  "plus",
  "minus",
  "x",
  "check",
  "chevron-left",
  "chevron-right",
  "chevron-down",
  "chevron-up",
  "arrow-left",
  "arrow-right",
  "arrow-up",
  "arrow-down",
  "arrow-up-right",
  "arrow-down-left",
  "search",
  "filter",
  "calendar",
  "clock",
  "pencil",
  "trash",
  "pause",
  "play",
  "more",
  "menu",
  "log-out",
  "refresh",
  "upload",
  "file",
  "lock",
  "user",
  "smartphone",
  "monitor",
  "sun",
  "moon",
  // Status
  "info",
  "alert-circle",
  "alert-triangle",
  "check-circle",
  "trending-up",
  "trending-down",
  "wallet",
  // Category glyphs
  "home",
  "utensils",
  "shopping-cart",
  "shopping-bag",
  "coffee",
  "car",
  "film",
  "heart-pulse",
  "receipt",
  "plane",
  "briefcase",
  "banknote",
  "zap",
  "gift",
  "dumbbell",
  "book",
  "tag",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const ICON_PATHS: Record<IconName, ReactNode> = {
  // --- Navigation -------------------------------------------------------------------------
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="9" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="5.5" rx="2" />
      <rect x="13.5" y="12.5" width="7" height="8" rx="2" />
      <rect x="3.5" y="16" width="7" height="4.5" rx="2" />
    </>
  ),
  transactions: (
    <>
      <path d="M7.5 4 3.5 8l4 4" />
      <path d="M3.5 8h13" />
      <path d="m16.5 12 4 4-4 4" />
      <path d="M20.5 16h-13" />
    </>
  ),
  budgets: (
    <>
      <path d="M20.5 14.5A9 9 0 1 1 9.5 3.5" />
      <path d="M21 10.5A9 9 0 0 0 13.5 3v7.5z" />
    </>
  ),
  goals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.25" />
      <circle cx="12" cy="12" r="1.25" />
    </>
  ),
  subscriptions: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 10h19" />
      <path d="M6.5 15h3" />
    </>
  ),
  recurring: (
    <>
      <path d="m17 3.5 3.5 3.5-3.5 3.5" />
      <path d="M3.5 12V11a4 4 0 0 1 4-4h13" />
      <path d="m7 20.5-3.5-3.5L7 13.5" />
      <path d="M20.5 12v1a4 4 0 0 1-4 4h-13" />
    </>
  ),
  achievements: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="m8.6 14 -1.1 7 4.5-2.6 4.5 2.6-1.1-7" />
    </>
  ),
  assistant: (
    <>
      <path d="M10.5 4c.75 5.2 2.8 7.25 8 8-5.2.75-7.25 2.8-8 8-.75-5.2-2.8-7.25-8-8 5.2-.75 7.25-2.8 8-8z" />
      <path d="M19 3v3.5" />
      <path d="M17.25 4.75h3.5" />
    </>
  ),
  categories: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="3.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="3.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  import: (
    <>
      <path d="M12 15.5V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 15v3a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  security: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),

  // --- Actions & interface ----------------------------------------------------------------
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  x: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  "chevron-left": <path d="m14.5 6-6 6 6 6" />,
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-up": <path d="m6 14.5 6-6 6 6" />,
  "arrow-left": (
    <>
      <path d="M19.5 12h-15" />
      <path d="m11 5.5-6.5 6.5 6.5 6.5" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M4.5 12h15" />
      <path d="m13 5.5 6.5 6.5-6.5 6.5" />
    </>
  ),
  "arrow-up": (
    <>
      <path d="M12 19.5v-15" />
      <path d="m5.5 11 6.5-6.5 6.5 6.5" />
    </>
  ),
  "arrow-down": (
    <>
      <path d="M12 4.5v15" />
      <path d="m5.5 13 6.5 6.5 6.5-6.5" />
    </>
  ),
  "arrow-up-right": (
    <>
      <path d="M7 17 17 7" />
      <path d="M8.5 7H17v8.5" />
    </>
  ),
  "arrow-down-left": (
    <>
      <path d="M17 7 7 17" />
      <path d="M15.5 17H7V8.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  filter: <path d="M3.5 5.5h17l-6.5 8v5.5l-4 1.5v-7z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pencil: (
    <>
      <path d="m15.5 4.5 4 4L8.5 19.5 4 20l.5-4.5z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="m6 7 .9 12.2a1.5 1.5 0 0 0 1.5 1.3h7.2a1.5 1.5 0 0 0 1.5-1.3L18 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1.25" />
      <rect x="14" y="5" width="4" height="14" rx="1.25" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  "log-out": (
    <>
      <path d="M9.5 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h3" />
      <path d="m16 8 4 4-4 4" />
      <path d="M20 12H9.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.3-3.6L3.5 10" />
      <path d="M3.5 4.5V10H9" />
      <path d="M4 13a8 8 0 0 0 14.3 3.6l2.2-2.6" />
      <path d="M20.5 19.5V14H15" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 15v3a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3" />
    </>
  ),
  file: (
    <>
      <path d="M6.5 3h7.5l4.5 4.5V19a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v4.5h4.5" />
      <path d="M8.5 13h7" />
      <path d="M8.5 16.5h5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.6-3.9 3.5-6 7.5-6s6.9 2.1 7.5 6" />
    </>
  ),
  smartphone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="3" />
      <path d="M8.5 21h7" />
      <path d="M12 17v4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5V4.5" />
      <path d="M12 19.5v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2.5 12h2" />
      <path d="M19.5 12h2" />
      <path d="m4.9 19.1 1.4-1.4" />
      <path d="m17.7 6.3 1.4-1.4" />
    </>
  ),
  moon: <path d="M20.5 13.3A8.5 8.5 0 1 1 10.7 3.5a6.8 6.8 0 0 0 9.8 9.8z" />,

  // --- Status -----------------------------------------------------------------------------
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6h.01" />
    </>
  ),
  "alert-circle": (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7.5v5" />
      <path d="M12 16.2h.01" />
    </>
  ),
  "alert-triangle": (
    <>
      <path d="M12.9 4.1a1 1 0 0 0-1.8 0L2.6 19a1 1 0 0 0 .9 1.5h17a1 1 0 0 0 .9-1.5z" />
      <path d="M12 10v4" />
      <path d="M12 17.2h.01" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.5 2.7 2.7L16.3 9.6" />
    </>
  ),
  "trending-up": (
    <>
      <path d="m3.5 17 6-6 4 4 7-7.5" />
      <path d="M15 7.5h5.5V13" />
    </>
  ),
  "trending-down": (
    <>
      <path d="m3.5 7 6 6 4-4 7 7.5" />
      <path d="M15 16.5h5.5V11" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7.5V6a2 2 0 0 0-2-2H6a2.5 2.5 0 0 0 0 5h13.5a1.5 1.5 0 0 1 1.5 1.5v8a2 2 0 0 1-2 2H6a2.5 2.5 0 0 1-2.5-2.5V6.5" />
      <circle cx="16.5" cy="14" r="1.1" />
    </>
  ),

  // --- Category glyphs --------------------------------------------------------------------
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.5" />
      <path d="M10 20.5v-5h4v5" />
    </>
  ),
  utensils: (
    <>
      <path d="M6 3v5.5a3 3 0 0 0 6 0V3" />
      <path d="M9 3v5.5" />
      <path d="M9 11.5V21" />
      <path d="M17.5 21V3c-2.4 1.3-3.6 3.8-3.6 7.2 0 1.7 1.2 2.6 3.6 2.8" />
    </>
  ),
  "shopping-cart": (
    <>
      <circle cx="9.5" cy="19.5" r="1.4" />
      <circle cx="17.5" cy="19.5" r="1.4" />
      <path d="M2.5 4h2.7l2.2 10.5h10.3L19.5 7H6" />
    </>
  ),
  "shopping-bag": (
    <>
      <path d="M5.5 8h13l-.9 11.2a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  coffee: (
    <>
      <path d="M5 9h11v5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8.5 3.5v2" />
      <path d="M12 3.5v2" />
    </>
  ),
  car: (
    <>
      <rect x="5" y="3.5" width="14" height="14" rx="3.5" />
      <path d="M5 11h14" />
      <path d="M8.5 14.25h.01" />
      <path d="M15.5 14.25h.01" />
      <path d="M7.5 17.5V20" />
      <path d="M16.5 17.5V20" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M7.5 4v16" />
      <path d="M16.5 4v16" />
      <path d="M3.5 9h4" />
      <path d="M3.5 15h4" />
      <path d="M16.5 9h4" />
      <path d="M16.5 15h4" />
    </>
  ),
  "heart-pulse": (
    <>
      <path d="M12 20.5S3.5 15.6 3.5 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 2.6c0 6.4-8.5 11.3-8.5 11.3z" />
      <path d="M6.5 12.5h3l1.5-3 2.5 5 1.5-2h2.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12V21l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.6z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3" />
    </>
  ),
  plane: <path d="M21.5 15.5 13.5 11V5.5a1.5 1.5 0 0 0-3 0V11l-8 4.5V18l8-2.3V19l-2 1.5V22l3.5-1 3.5 1v-1.5l-2-1.5v-3.3l8 2.3z" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3 13h18" />
      <path d="M11 13h2" />
    </>
  ),
  banknote: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="3" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 12h.01" />
      <path d="M18 12h.01" />
    </>
  ),
  zap: <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />,
  gift: (
    <>
      <rect x="3.5" y="8.5" width="17" height="4" rx="1.25" />
      <path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" />
      <path d="M12 8.5v12" />
      <path d="M12 8.5C11 5 7.5 4 6.5 5.7c-.8 1.4.6 2.8 5.5 2.8z" />
      <path d="M12 8.5c1-3.5 4.5-4.5 5.5-2.8.8 1.4-.6 2.8-5.5 2.8z" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M6.5 6.5v11" />
      <path d="M17.5 6.5v11" />
      <path d="M3.5 9.5v5" />
      <path d="M20.5 9.5v5" />
      <path d="M6.5 12h11" />
    </>
  ),
  book: (
    <>
      <path d="M5 5A2 2 0 0 1 7 3h12v14H7a2 2 0 0 0-2 2z" />
      <path d="M5 19a2 2 0 0 0 2 2h12v-4" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 12.6 12.6 20.6a2 2 0 0 1-2.8 0L3.5 14.3V3.5h10.8l6.3 6.3a2 2 0 0 1 0 2.8z" />
      <circle cx="8" cy="8" r="1.25" />
    </>
  ),
};
