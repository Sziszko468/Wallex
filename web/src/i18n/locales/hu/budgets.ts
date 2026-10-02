import type { DeepStrings } from "../../types";
import type { budgets as enBudgets, categories as enCategories } from "../en/budgets";

export const budgets: DeepStrings<typeof enBudgets> = {
  title: "Költségkeretek",
  description: "Mennyit tervezel költeni, és hogyan áll.",
  overall: "Összesen",
  emptyTitle: "Nincs költségkeret erre a hónapra: {{period}}",
  emptyMessage: "A hónapra beállított költségkeretek itt jelennek meg, azzal együtt, hogy mennyit költöttél és mennyi maradt.",
  status: {
    on_track: "Rendben",
    ahead_of_pace: "Gyorsabb a tervnél",
    near_limit: "A határ közelében",
    over_budget: "Túllépve",
  },
  row: {
    amounts: "{{spent}} / {{budget}}",
    used: "{{name}} felhasznált költségkerete",
    over: "{{amount}} túllépés",
    left: "{{amount}} maradt",
    usage: "{{percentage}} felhasználva",
    overBudget: "{{percentage}} túllépés",
    underBudget: "{{percentage}} a keret alatt",
  },
};

export const categories: DeepStrings<typeof enCategories> = {
  title: "Kategóriák",
  description: "Hogyan rendszerezed a költéseidet.",
  emptyTitle: "Egyéni kategóriák hamarosan",
  emptyMessage:
    "Hamarosan itt saját kategóriákat is hozzáadhatsz és rendszerezhetsz. Az alapértelmezett kategóriák már most működnek a tranzakcióiddal és költségkereteiddel.",
};
