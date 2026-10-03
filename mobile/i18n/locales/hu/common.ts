import type { DeepStrings } from "../../types";
import type { common as en } from "../en/common";

export const common: DeepStrings<typeof en> = {
  actions: {
    cancel: "Mégse",
    close: "Bezárás",
    delete: "Törlés",
    edit: "Szerkesztés",
    retry: "Újra",
    done: "Kész",
    save: "Mentés",
    saveChanges: "Módosítások mentése",
    pause: "Szüneteltetés",
    resume: "Folytatás",
  },
  states: {
    loading: "Betöltés…",
    checkingSession: "Munkamenet ellenőrzése…",
    notAvailable: "—",
  },
  transactionType: {
    expense: "Kiadás",
    income: "Bevétel",
  },
  month: {
    previous: "Előző hónap",
    next: "Következő hónap",
  },
  dates: {
    today: "Ma",
    yesterday: "Tegnap",
  },
  form: {
    amount: "Összeg",
    amountIn: "Összeg ({{currency}})",
    category: "Kategória",
    date: "Dátum",
    datePlaceholder: "ÉÉÉÉ-HH-NN",
    description: "Leírás (opcionális)",
    descriptionPlaceholder: "pl. Bevásárlás",
    name: "Név",
    noCategories: "Ehhez a típushoz nincs elérhető kategória.",
  },
  validation: {
    amountRequired: "Az összeg megadása kötelező.",
    amountPositive: "Az összegnek 0-nál nagyobbnak kell lennie.",
    noDecimals: "{{currency}} összegben nem lehetnek tizedesjegyek.",
    categoryRequired: "Válassz kategóriát.",
    dateRequired: "A dátum megadása kötelező.",
    dateInvalid: "Adj meg érvényes dátumot (ÉÉÉÉ-HH-NN).",
    nameRequired: "A név megadása kötelező.",
  },
  confirm: {
    deleteMessage: "Törlöd ezt: „{{name}}”? Ez nem vonható vissza.",
  },
  saved: "Mentve ✓",
  savedOffline: "Offline mentve – szinkronizáljuk ✓",
  saveOffline: "Mentés offline",
  uncategorized: "Kategória nélkül",
  transaction: "Tranzakció",
  language: {
    label: "Nyelv",
  },
};
