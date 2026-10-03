import type { ReactNode } from "react";
import { Circle, Path, Rect } from "react-native-svg";

/**
 * WALLEX's icon set on the phone — the web app's set (web/src/components/icons/iconPaths.tsx),
 * same 24×24 grid, same 1.75px rounded strokes, same names. Drawn in-house, so the app ships no
 * icon library; react-native-svg only draws them. Add an icon by adding its name to ICON_NAMES
 * and its geometry below; <Icon> does the rest. A test keeps the two sets in step.
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
  "camera",
  "image",
  "bell",
  "globe",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const ICON_PATHS: Record<IconName, ReactNode> = {
  // --- Navigation -------------------------------------------------------------------------
  dashboard: (
    <>
      <Rect x="3.5" y="3.5" width="7" height="9" rx="2" />
      <Rect x="13.5" y="3.5" width="7" height="5.5" rx="2" />
      <Rect x="13.5" y="12.5" width="7" height="8" rx="2" />
      <Rect x="3.5" y="16" width="7" height="4.5" rx="2" />
    </>
  ),
  transactions: (
    <>
      <Path d="M7.5 4 3.5 8l4 4" />
      <Path d="M3.5 8h13" />
      <Path d="m16.5 12 4 4-4 4" />
      <Path d="M20.5 16h-13" />
    </>
  ),
  budgets: (
    <>
      <Path d="M20.5 14.5A9 9 0 1 1 9.5 3.5" />
      <Path d="M21 10.5A9 9 0 0 0 13.5 3v7.5z" />
    </>
  ),
  goals: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="5.25" />
      <Circle cx="12" cy="12" r="1.25" />
    </>
  ),
  subscriptions: (
    <>
      <Rect x="2.5" y="5" width="19" height="14" rx="3" />
      <Path d="M2.5 10h19" />
      <Path d="M6.5 15h3" />
    </>
  ),
  recurring: (
    <>
      <Path d="m17 3.5 3.5 3.5-3.5 3.5" />
      <Path d="M3.5 12V11a4 4 0 0 1 4-4h13" />
      <Path d="m7 20.5-3.5-3.5L7 13.5" />
      <Path d="M20.5 12v1a4 4 0 0 1-4 4h-13" />
    </>
  ),
  achievements: (
    <>
      <Circle cx="12" cy="9" r="6" />
      <Path d="m8.6 14 -1.1 7 4.5-2.6 4.5 2.6-1.1-7" />
    </>
  ),
  assistant: (
    <>
      <Path d="M10.5 4c.75 5.2 2.8 7.25 8 8-5.2.75-7.25 2.8-8 8-.75-5.2-2.8-7.25-8-8 5.2-.75 7.25-2.8 8-8z" />
      <Path d="M19 3v3.5" />
      <Path d="M17.25 4.75h3.5" />
    </>
  ),
  categories: (
    <>
      <Rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <Rect x="13.5" y="3.5" width="7" height="7" rx="3.5" />
      <Rect x="3.5" y="13.5" width="7" height="7" rx="3.5" />
      <Rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  import: (
    <>
      <Path d="M12 15.5V4" />
      <Path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <Path d="M4 15v3a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3" />
    </>
  ),
  settings: (
    <>
      <Path d="M4 7h9" />
      <Path d="M17 7h3" />
      <Circle cx="15" cy="7" r="2" />
      <Path d="M4 17h3" />
      <Path d="M11 17h9" />
      <Circle cx="9" cy="17" r="2" />
    </>
  ),
  security: (
    <>
      <Path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z" />
      <Path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),

  // --- Actions & interface ----------------------------------------------------------------
  plus: (
    <>
      <Path d="M12 5v14" />
      <Path d="M5 12h14" />
    </>
  ),
  minus: <Path d="M5 12h14" />,
  x: (
    <>
      <Path d="m6 6 12 12" />
      <Path d="M18 6 6 18" />
    </>
  ),
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  "chevron-left": <Path d="m14.5 6-6 6 6 6" />,
  "chevron-right": <Path d="m9.5 6 6 6-6 6" />,
  "chevron-down": <Path d="m6 9.5 6 6 6-6" />,
  "chevron-up": <Path d="m6 14.5 6-6 6 6" />,
  "arrow-left": (
    <>
      <Path d="M19.5 12h-15" />
      <Path d="m11 5.5-6.5 6.5 6.5 6.5" />
    </>
  ),
  "arrow-right": (
    <>
      <Path d="M4.5 12h15" />
      <Path d="m13 5.5 6.5 6.5-6.5 6.5" />
    </>
  ),
  "arrow-up": (
    <>
      <Path d="M12 19.5v-15" />
      <Path d="m5.5 11 6.5-6.5 6.5 6.5" />
    </>
  ),
  "arrow-down": (
    <>
      <Path d="M12 4.5v15" />
      <Path d="m5.5 13 6.5 6.5 6.5-6.5" />
    </>
  ),
  "arrow-up-right": (
    <>
      <Path d="M7 17 17 7" />
      <Path d="M8.5 7H17v8.5" />
    </>
  ),
  "arrow-down-left": (
    <>
      <Path d="M17 7 7 17" />
      <Path d="M15.5 17H7V8.5" />
    </>
  ),
  search: (
    <>
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="m20 20-4.4-4.4" />
    </>
  ),
  filter: <Path d="M3.5 5.5h17l-6.5 8v5.5l-4 1.5v-7z" />,
  calendar: (
    <>
      <Rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <Path d="M3.5 10h17" />
      <Path d="M8 3v4" />
      <Path d="M16 3v4" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  pencil: (
    <>
      <Path d="m15.5 4.5 4 4L8.5 19.5 4 20l.5-4.5z" />
      <Path d="m13.5 6.5 4 4" />
    </>
  ),
  trash: (
    <>
      <Path d="M4 7h16" />
      <Path d="M9.5 7V4.5h5V7" />
      <Path d="m6 7 .9 12.2a1.5 1.5 0 0 0 1.5 1.3h7.2a1.5 1.5 0 0 0 1.5-1.3L18 7" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
    </>
  ),
  pause: (
    <>
      <Rect x="6" y="5" width="4" height="14" rx="1.25" />
      <Rect x="14" y="5" width="4" height="14" rx="1.25" />
    </>
  ),
  play: <Path d="M8 5.5v13l10.5-6.5z" />,
  more: (
    <>
      <Circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <Circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <Circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  menu: (
    <>
      <Path d="M4 7h16" />
      <Path d="M4 12h16" />
      <Path d="M4 17h16" />
    </>
  ),
  "log-out": (
    <>
      <Path d="M9.5 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h3" />
      <Path d="m16 8 4 4-4 4" />
      <Path d="M20 12H9.5" />
    </>
  ),
  refresh: (
    <>
      <Path d="M20 11a8 8 0 0 0-14.3-3.6L3.5 10" />
      <Path d="M3.5 4.5V10H9" />
      <Path d="M4 13a8 8 0 0 0 14.3 3.6l2.2-2.6" />
      <Path d="M20.5 19.5V14H15" />
    </>
  ),
  upload: (
    <>
      <Path d="M12 15.5V4" />
      <Path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <Path d="M4 15v3a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3" />
    </>
  ),
  file: (
    <>
      <Path d="M6.5 3h7.5l4.5 4.5V19a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <Path d="M14 3v4.5h4.5" />
      <Path d="M8.5 13h7" />
      <Path d="M8.5 16.5h5" />
    </>
  ),
  lock: (
    <>
      <Rect x="4.5" y="10.5" width="15" height="10" rx="3" />
      <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  user: (
    <>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4.5 20.5c.6-3.9 3.5-6 7.5-6s6.9 2.1 7.5 6" />
    </>
  ),
  smartphone: (
    <>
      <Rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <Path d="M10.5 18.5h3" />
    </>
  ),
  monitor: (
    <>
      <Rect x="2.5" y="4" width="19" height="13" rx="3" />
      <Path d="M8.5 21h7" />
      <Path d="M12 17v4" />
    </>
  ),
  sun: (
    <>
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2.5V4.5" />
      <Path d="M12 19.5v2" />
      <Path d="m4.9 4.9 1.4 1.4" />
      <Path d="m17.7 17.7 1.4 1.4" />
      <Path d="M2.5 12h2" />
      <Path d="M19.5 12h2" />
      <Path d="m4.9 19.1 1.4-1.4" />
      <Path d="m17.7 6.3 1.4-1.4" />
    </>
  ),
  moon: <Path d="M20.5 13.3A8.5 8.5 0 1 1 10.7 3.5a6.8 6.8 0 0 0 9.8 9.8z" />,

  // --- Status -----------------------------------------------------------------------------
  info: (
    <>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M12 11v5.5" />
      <Path d="M12 7.6h.01" />
    </>
  ),
  "alert-circle": (
    <>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M12 7.5v5" />
      <Path d="M12 16.2h.01" />
    </>
  ),
  "alert-triangle": (
    <>
      <Path d="M12.9 4.1a1 1 0 0 0-1.8 0L2.6 19a1 1 0 0 0 .9 1.5h17a1 1 0 0 0 .9-1.5z" />
      <Path d="M12 10v4" />
      <Path d="M12 17.2h.01" />
    </>
  ),
  "check-circle": (
    <>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="m8 12.5 2.7 2.7L16.3 9.6" />
    </>
  ),
  "trending-up": (
    <>
      <Path d="m3.5 17 6-6 4 4 7-7.5" />
      <Path d="M15 7.5h5.5V13" />
    </>
  ),
  "trending-down": (
    <>
      <Path d="m3.5 7 6 6 4-4 7 7.5" />
      <Path d="M15 16.5h5.5V11" />
    </>
  ),
  wallet: (
    <>
      <Path d="M19 7.5V6a2 2 0 0 0-2-2H6a2.5 2.5 0 0 0 0 5h13.5a1.5 1.5 0 0 1 1.5 1.5v8a2 2 0 0 1-2 2H6a2.5 2.5 0 0 1-2.5-2.5V6.5" />
      <Circle cx="16.5" cy="14" r="1.1" />
    </>
  ),

  // --- Category glyphs --------------------------------------------------------------------
  home: (
    <>
      <Path d="M3.5 11 12 4l8.5 7" />
      <Path d="M5.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.5" />
      <Path d="M10 20.5v-5h4v5" />
    </>
  ),
  utensils: (
    <>
      <Path d="M6 3v5.5a3 3 0 0 0 6 0V3" />
      <Path d="M9 3v5.5" />
      <Path d="M9 11.5V21" />
      <Path d="M17.5 21V3c-2.4 1.3-3.6 3.8-3.6 7.2 0 1.7 1.2 2.6 3.6 2.8" />
    </>
  ),
  "shopping-cart": (
    <>
      <Circle cx="9.5" cy="19.5" r="1.4" />
      <Circle cx="17.5" cy="19.5" r="1.4" />
      <Path d="M2.5 4h2.7l2.2 10.5h10.3L19.5 7H6" />
    </>
  ),
  "shopping-bag": (
    <>
      <Path d="M5.5 8h13l-.9 11.2a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3z" />
      <Path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  coffee: (
    <>
      <Path d="M5 9h11v5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14z" />
      <Path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <Path d="M8.5 3.5v2" />
      <Path d="M12 3.5v2" />
    </>
  ),
  car: (
    <>
      <Rect x="5" y="3.5" width="14" height="14" rx="3.5" />
      <Path d="M5 11h14" />
      <Path d="M8.5 14.25h.01" />
      <Path d="M15.5 14.25h.01" />
      <Path d="M7.5 17.5V20" />
      <Path d="M16.5 17.5V20" />
    </>
  ),
  film: (
    <>
      <Rect x="3.5" y="4" width="17" height="16" rx="3" />
      <Path d="M7.5 4v16" />
      <Path d="M16.5 4v16" />
      <Path d="M3.5 9h4" />
      <Path d="M3.5 15h4" />
      <Path d="M16.5 9h4" />
      <Path d="M16.5 15h4" />
    </>
  ),
  "heart-pulse": (
    <>
      <Path d="M12 20.5S3.5 15.6 3.5 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 2.6c0 6.4-8.5 11.3-8.5 11.3z" />
      <Path d="M6.5 12.5h3l1.5-3 2.5 5 1.5-2h2.5" />
    </>
  ),
  receipt: (
    <>
      <Path d="M6 3.5h12V21l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.6z" />
      <Path d="M9 8h6" />
      <Path d="M9 12h6" />
      <Path d="M9 16h3" />
    </>
  ),
  plane: <Path d="M21.5 15.5 13.5 11V5.5a1.5 1.5 0 0 0-3 0V11l-8 4.5V18l8-2.3V19l-2 1.5V22l3.5-1 3.5 1v-1.5l-2-1.5v-3.3l8 2.3z" />,
  briefcase: (
    <>
      <Rect x="3" y="7" width="18" height="13" rx="3" />
      <Path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <Path d="M3 13h18" />
      <Path d="M11 13h2" />
    </>
  ),
  banknote: (
    <>
      <Rect x="2.5" y="6" width="19" height="12" rx="3" />
      <Circle cx="12" cy="12" r="2.6" />
      <Path d="M6 12h.01" />
      <Path d="M18 12h.01" />
    </>
  ),
  zap: <Path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />,
  gift: (
    <>
      <Rect x="3.5" y="8.5" width="17" height="4" rx="1.25" />
      <Path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" />
      <Path d="M12 8.5v12" />
      <Path d="M12 8.5C11 5 7.5 4 6.5 5.7c-.8 1.4.6 2.8 5.5 2.8z" />
      <Path d="M12 8.5c1-3.5 4.5-4.5 5.5-2.8.8 1.4-.6 2.8-5.5 2.8z" />
    </>
  ),
  dumbbell: (
    <>
      <Path d="M6.5 6.5v11" />
      <Path d="M17.5 6.5v11" />
      <Path d="M3.5 9.5v5" />
      <Path d="M20.5 9.5v5" />
      <Path d="M6.5 12h11" />
    </>
  ),
  book: (
    <>
      <Path d="M5 5A2 2 0 0 1 7 3h12v14H7a2 2 0 0 0-2 2z" />
      <Path d="M5 19a2 2 0 0 0 2 2h12v-4" />
    </>
  ),
  tag: (
    <>
      <Path d="M20.6 12.6 12.6 20.6a2 2 0 0 1-2.8 0L3.5 14.3V3.5h10.8l6.3 6.3a2 2 0 0 1 0 2.8z" />
      <Circle cx="8" cy="8" r="1.25" />
    </>
  ),

  // --- Added for the phone app ------------------------------------------------------------
  camera: (
    <>
      <Path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2a2 2 0 0 0 1.6-.8l.5-.7A2 2 0 0 1 11.4 4h1.2a2 2 0 0 1 1.6.9l.5.7a2 2 0 0 0 1.6.8h1.2A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <Circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  image: (
    <>
      <Rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <Circle cx="9" cy="10" r="1.6" />
      <Path d="m4 17 4.5-4.5 3.5 3.5 2.5-2.5L20 16.5" />
    </>
  ),
  bell: (
    <>
      <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <Path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  globe: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M3 12h18" />
      <Path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </>
  ),
};
