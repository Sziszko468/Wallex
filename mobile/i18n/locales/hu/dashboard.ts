import type { DeepStrings } from "../../types";
import type { budgets as enBudgets, dashboard as enDashboard } from "../en/dashboard";

export const dashboard: DeepStrings<typeof enDashboard> = {
  greeting: "Szia",
  greetingWithName: "Szia, {{name}}",
  addTransaction: "Tranzakció hozzáadása",
  cards: {
    overview: "Áttekintés",
    insights: "Meglátások",
    monthly: "Havi kiadások",
    topCategories: "Legnagyobb kategóriák",
    recent: "Legutóbbi tranzakciók",
    budgetStatus: "Költségkeretek állapota",
  },
  summary: {
    balance: "Egyenleg",
    income: "↑ Bevétel",
    expenses: "↓ Kiadások",
    count_one: "{{count}} tranzakció ebben a hónapban",
    count_other: "{{count}} tranzakció ebben a hónapban",
  },
  insights: {
    empty: "Ebben a hónapban még nincs meglátás.",
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
  topCategories: {
    empty: "Ebben a hónapban még nincs kiadás.",
    share: "a kiadások {{percentage}}-a",
  },
  recent: {
    empty: "Még nincs tranzakció.",
  },
  trend: {
    income: "Bevétel",
    expenses: "Kiadások",
    column: "{{month}}: bevétel {{income}}, kiadás {{expenses}}",
  },
  budgetStatus: {
    empty: "Ebben a hónapban nincs költségkeret beállítva.",
    overall: "Összesen",
    over: "{{amount}} túllépés",
    left: "{{amount}} maradt · {{percentage}}",
  },
};

export const budgets: DeepStrings<typeof enBudgets> = {
  empty: "Ebben a hónapban nincs költségkeret beállítva.",
  overall: "Összesen",
  used: "{{percentage}} felhasználva",
  over: "{{amount}} túllépés",
  left: "{{amount}} maradt",
  overBudget: "⚠ Túllépted a havi költségkeretet",
};
