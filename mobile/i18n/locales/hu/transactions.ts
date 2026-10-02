import type { DeepStrings } from "../../types";
import type { recurring as enRecurring, transactions as enTransactions } from "../en/transactions";

export const transactions: DeepStrings<typeof enTransactions> = {
  search: "Tranzakciók keresése",
  clearSearch: "Keresés törlése",
  presets: {
    all: "Összes",
    thisMonth: "Ez a hónap",
    lastMonth: "Előző hónap",
  },
  allCategories: "Mind",
  empty: "Egyetlen tranzakció sem felel meg a szűrőknek.",
  endOfList: "Ez volt az összes tranzakció.",
  itemLabel: "{{title}}, {{category}}, {{date}}, {{amount}}",
  itemLabelConverted: "{{title}}, {{category}}, {{date}}, {{amount}}, {{converted}}",
  pending: {
    heading: "Még nincs szinkronizálva",
    failed: "Sikertelen",
    pending: "Függőben",
    retry: "Újra",
    discard: "Elvetés",
    category: "Kategória",
  },
  details: {
    description: "Leírás",
    date: "Dátum",
    inCurrency: "{{currency}} értéke",
    type: "Típus",
    deleteTitle: "Tranzakció törlése",
    thisTransaction: "ez a tranzakció",
    conflictTitle: "Másik eszközön módosítva",
    conflictMessage:
      "Ezt a tranzakciót épp most módosították egy másik eszközön, ezért nem töröltük. Most a legfrissebb változat látható.",
    couldntDelete: "A törlés nem sikerült",
  },
  form: {
    scanInstead: "📷  Inkább blokk beolvasása",
    offlineEdit: "Offline vagy. A szerkesztéshez kapcsolat kell – próbáld újra, ha újra online vagy.",
    conflict:
      "Ezt a tranzakciót épp most módosították egy másik eszközön. A legfrissebb változat látható – végezd el újra a módosítást, és mentsd.",
    gone: "Ez a tranzakció már nem létezik – egy másik eszközön törölték.",
  },
};

export const recurring: DeepStrings<typeof enRecurring> = {
  empty: "Még nincs ismétlődő tranzakció. Koppints a + gombra a lakbér, előfizetések vagy számlák hozzáadásához.",
  add: "Ismétlődő tranzakció hozzáadása",
  deleteTitle: "Ismétlődő tranzakció törlése",
  couldntDelete: "A törlés nem sikerült",
  couldntUpdate: "A módosítás nem sikerült",
  next: "Következő: {{date}}",
  active: "Aktív",
  paused: "Szüneteltetve",
  pauseLabel: "{{name}} szüneteltetése",
  resumeLabel: "{{name}} folytatása",
  editLabel: "{{name}} szerkesztése",
  deleteLabel: "{{name}} törlése",
  frequency: {
    weekly: "Hetente",
    monthly: "Havonta",
    yearly: "Évente",
  },
  form: {
    namePlaceholder: "pl. Lakbér, Netflix, Spotify",
    frequency: "Gyakoriság",
    endDate: "Befejező dátum (opcionális)",
    descriptionPlaceholder: "pl. Lakás a Fő utcában",
    active: "Aktív",
    startRequired: "A kezdő dátum megadása kötelező.",
    endBeforeStart: "A befejező dátum nem lehet a kezdő dátum előtt.",
  },
};
