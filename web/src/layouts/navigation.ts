import type { IconName } from "../components/icons/iconPaths";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Every signed-in destination, grouped the way people think about them. The sidebar shows them all. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { to: "/assistant", label: "Assistant", icon: "assistant" },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/transactions", label: "Transactions", icon: "transactions" },
      { to: "/budgets", label: "Budgets", icon: "budgets" },
      { to: "/goals", label: "Goals", icon: "goals" },
      { to: "/subscriptions", label: "Subscriptions", icon: "subscriptions" },
      { to: "/recurring", label: "Recurring", icon: "recurring" },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/categories", label: "Categories", icon: "categories" },
      { to: "/import", label: "Import", icon: "import" },
      { to: "/achievements", label: "Achievements", icon: "achievements" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { to: "/settings", label: "Settings", icon: "settings" };
export const SECURITY_ITEM: NavItem = { to: "/settings/security", label: "Security", icon: "security" };

/** The three destinations in the phone's bottom bar; everything else lives behind "More". */
const BOTTOM_BAR_PATHS = ["/dashboard", "/transactions", "/budgets"];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export const BOTTOM_BAR_ITEMS: NavItem[] = BOTTOM_BAR_PATHS.flatMap((path) => ALL_ITEMS.filter((item) => item.to === path));

/** What "More" opens: every destination that isn't in the bottom bar. */
export const MORE_ITEMS: NavItem[] = [
  ...ALL_ITEMS.filter((item) => !BOTTOM_BAR_PATHS.includes(item.to)),
  SETTINGS_ITEM,
  SECURITY_ITEM,
];
