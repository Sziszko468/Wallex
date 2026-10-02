import type { IconName } from "../components/icons/iconPaths";
import type { TranslationKey } from "../i18n/types";

export interface NavItem {
  to: string;
  /** A translation key, resolved where the item is drawn. */
  labelKey: TranslationKey;
  icon: IconName;
}

export interface NavGroup {
  labelKey: TranslationKey;
  items: NavItem[];
}

/** Every signed-in destination, grouped the way people think about them. The sidebar shows them all. */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.groups.overview",
    items: [
      { to: "/dashboard", labelKey: "nav.items.dashboard", icon: "dashboard" },
      { to: "/assistant", labelKey: "nav.items.assistant", icon: "assistant" },
    ],
  },
  {
    labelKey: "nav.groups.money",
    items: [
      { to: "/transactions", labelKey: "nav.items.transactions", icon: "transactions" },
      { to: "/budgets", labelKey: "nav.items.budgets", icon: "budgets" },
      { to: "/goals", labelKey: "nav.items.goals", icon: "goals" },
      { to: "/subscriptions", labelKey: "nav.items.subscriptions", icon: "subscriptions" },
      { to: "/recurring", labelKey: "nav.items.recurring", icon: "recurring" },
    ],
  },
  {
    labelKey: "nav.groups.library",
    items: [
      { to: "/categories", labelKey: "nav.items.categories", icon: "categories" },
      { to: "/import", labelKey: "nav.items.import", icon: "import" },
      { to: "/achievements", labelKey: "nav.items.achievements", icon: "achievements" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { to: "/settings", labelKey: "nav.items.settings", icon: "settings" };
export const SECURITY_ITEM: NavItem = { to: "/settings/security", labelKey: "nav.items.security", icon: "security" };

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
