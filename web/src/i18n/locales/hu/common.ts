import type { DeepStrings } from "../../types";
import type { common as en } from "../en/common";

export const common: DeepStrings<typeof en> = {
  actions: {
    cancel: "Mégse",
    close: "Bezárás",
    confirm: "Megerősítés",
    delete: "Törlés",
    dismiss: "Elvetés",
    edit: "Szerkesztés",
    next: "Következő",
    previous: "Előző",
    retry: "Újra",
    logOut: "Kijelentkezés",
  },
  states: {
    loading: "Betöltés…",
    checkingSession: "Munkamenet ellenőrzése…",
    loadFailedTitle: "Nem sikerült betölteni",
    somethingWentWrong: "Valami hiba történt.",
    notAvailable: "—",
  },
  transactionType: {
    label: "Tranzakció típusa",
    expense: "Kiadás",
    income: "Bevétel",
  },
  month: {
    previous: "Előző hónap",
    next: "Következő hónap",
  },
  pagination: {
    label: "Tranzakciók lapozása",
    status: "{{page}}. oldal / {{totalPages}} · összesen {{totalCount}}",
  },
  theme: {
    label: "Téma",
    system: "Rendszer",
    light: "Világos",
    dark: "Sötét",
  },
  language: {
    label: "Nyelv",
  },
  currency: {
    label: "Pénznem",
  },
  labels: {
    balance: "Egyenleg",
    category: "Kategória",
    change: "Változás",
    expenses: "Kiadások",
    income: "Bevétel",
    status: "Állapot",
  },
  form: {
    amount: "Összeg",
    category: "Kategória",
    selectCategory: "Válassz kategóriát",
    date: "Dátum",
    descriptionOptional: "Leírás (opcionális)",
    name: "Név",
  },
  validation: {
    amountRequired: "Az összeg megadása kötelező.",
    amountPositive: "Az összegnek 0-nál nagyobbnak kell lennie.",
    noDecimals: "{{currency}} összegben nem lehetnek tizedesjegyek.",
    categoryRequired: "Válassz kategóriát.",
    dateRequired: "A dátum megadása kötelező.",
    nameRequired: "A név megadása kötelező.",
  },
  item: {
    edit: "{{name}} szerkesztése",
    delete: "{{name}} törlése",
  },
  confirm: {
    deleteMessage: "Törlöd ezt: „{{name}}”? Ez nem vonható vissza.",
  },
  dates: {
    today: "Ma",
    yesterday: "Tegnap",
  },
  skipToContent: "Ugrás a fő tartalomra",
  metaDescription: "{{appName}} – nyugodt módja annak, hogy lásd, hová megy a pénzed.",
};
