import type { DeepStrings } from "../../types";
import type { nav as en } from "../en/nav";

export const nav: DeepStrings<typeof en> = {
  primary: "Fő navigáció",
  more: "Továbbiak",
  moreDestinations: "További oldalak",
  newTransaction: "Új tranzakció",
  groups: {
    overview: "Áttekintés",
    money: "Pénzügyek",
    library: "Eszközök",
  },
  items: {
    dashboard: "Kezdőlap",
    assistant: "Asszisztens",
    transactions: "Tranzakciók",
    budgets: "Költségkeretek",
    goals: "Célok",
    subscriptions: "Előfizetések",
    recurring: "Ismétlődők",
    categories: "Kategóriák",
    import: "Importálás",
    achievements: "Eredmények",
    settings: "Beállítások",
    security: "Biztonság",
  },
};
