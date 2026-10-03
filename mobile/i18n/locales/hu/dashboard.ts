import type { DeepStrings } from "../../types";
import type { analytics as enAnalytics, budgets as enBudgets, dashboard as enDashboard } from "../en/dashboard";

export const dashboard: DeepStrings<typeof enDashboard> = {
  greeting: {
    morning: "Jó reggelt",
    afternoon: "Jó napot",
    evening: "Jó estét",
  },
  account: "Fiók és beállítások",
  askAssistant: "Kérdezd az asszisztenst",
  summary: {
    balance: "Egyenleg",
    income: "Bevétel",
    expenses: "Kiadások",
    count_one: "{{count}} tranzakció ebben a hónapban",
    count_other: "{{count}} tranzakció ebben a hónapban",
  },
  firstRun: {
    title: "Még nincs tranzakciód",
    message: "Add hozzá az első tranzakciót, és a(z) {{appName}} elkezdi felépíteni a pénzügyi áttekintésedet.",
    action: "Tranzakció hozzáadása",
  },
  insights: {
    title: "Meglátások",
    empty: "Ebben a hónapban még nincs meglátás.",
    showMore_one: "{{count}} további megjelenítése",
    showMore_other: "{{count}} további megjelenítése",
    showLess: "Kevesebb",
    amount: {
      top_category: "{{amount}} elköltve",
      category_increase: "{{amount}} többlet",
      category_decrease: "{{amount}} megtakarítás",
      budget_exceeded: "{{amount}} túllépés",
      budget_warning: "{{amount}} maradt",
      recurring_share: "{{amount}} ismétlődő havonta",
      overspending: "{{amount}} a bevétel felett",
      savings: "{{amount}} megtakarítva",
    },
  },
  spending: {
    title: "Hová ment a pénz",
    seeAnalytics: "Elemzés",
    empty: "Ebben a hónapban még nincs kiadás.",
    share: "a kiadások {{percentage}}-a",
    barLabel: "Kiadások kategóriánként",
  },
  budgets: {
    title: "Költségkeretek",
    viewAll: "Összes",
  },
  recent: {
    title: "Legutóbbi",
    viewAll: "Összes",
    empty: "Még nincs tranzakció.",
  },
};

export const budgets: DeepStrings<typeof enBudgets> = {
  empty: "Ebben a hónapban nincs költségkeret beállítva.",
  overall: "Összesen",
  byCategory: "Kategóriánként",
  amounts: "{{spent}} / {{budget}}",
  used: "{{percentage}} felhasználva",
  over: "{{amount}} túllépés",
  left: "{{amount}} maradt",
  status: {
    onTrack: "Rendben",
    nearLimit: "Közel a limithez",
    over: "Túllépve",
  },
};

export const analytics: DeepStrings<typeof enAnalytics> = {
  title: "Elemzés",
  months: {
    title: "Bevételek és kiadások",
    income: "Bevétel",
    expenses: "Kiadások",
    column: "{{month}}: bevétel {{income}}, kiadás {{expenses}}",
    hint: "Koppints egy hónapra, és megjelennek a számai.",
  },
  categories: {
    title: "Kiadások kategóriánként",
    total: "Összes kiadás",
    empty: "Ebben a hónapban nincs kiadás.",
    share: "a kiadások {{percentage}}-a",
  },
};
