import type { DeepStrings } from "../../types";
import type { transactions as en } from "../en/transactions";

export const transactions: DeepStrings<typeof en> = {
  title: "Tranzakciók",
  description: "Minden, amit kerestél és elköltöttél.",
  add: "Tranzakció hozzáadása",
  fallbackName: "Tranzakció",
  thisTransaction: "ez a tranzakció",
  toast: {
    saved: "Módosítások mentve",
    added: "Tranzakció hozzáadva",
    deleted: "Tranzakció törölve",
  },
  empty: {
    filteredTitle: "Egyetlen tranzakció sem felel meg a szűrőknek",
    filteredMessage: "Próbálj más keresést, vagy töröld a szűrőket, hogy mindent lásd.",
    title: "Még nincs tranzakció",
    message: "Add hozzá az első tranzakciódat, hogy megértsd a költéseidet.",
  },
  delete: {
    title: "Tranzakció törlése",
    conflict:
      "Ezt a tranzakciót épp most módosították egy másik eszközön, ezért nem töröltük. Nézd meg a legfrissebb változatot, és próbáld újra.",
  },
  filters: {
    label: "Tranzakciók szűrése",
    search: "Keresés",
    searchPlaceholder: "Tranzakciók keresése…",
    toggle: "Szűrők",
    toggleActive: "Szűrők ({{count}})",
    all: "Mind",
    expenses: "Kiadások",
    income: "Bevételek",
    allCategories: "Minden kategória",
    from: "Ettől",
    to: "Eddig",
    sortBy: "Rendezés",
    clear: "Szűrők törlése",
    sort: {
      newest: "Legújabb elöl",
      oldest: "Legrégebbi elöl",
      highest: "Legnagyobb összeg",
      lowest: "Legkisebb összeg",
    },
  },
  form: {
    addTitle: "Tranzakció hozzáadása",
    editTitle: "Tranzakció szerkesztése",
    descriptionPlaceholder: "pl. Bevásárlás",
    converting: "Átváltás…",
    rateSource: "{{date}} EKB-árfolyama",
    submitAdd: "Tranzakció hozzáadása",
    submitSave: "Módosítások mentése",
    errors: {
      conflict:
        "Ezt a tranzakciót épp most módosították egy másik eszközön. A legfrissebb változat látható – végezd el újra a módosítást, és mentsd.",
      gone: "Ez a tranzakció már nem létezik – egy másik eszközön törölték.",
    },
  },
  quickAdd: {
    categoriesFailed: "Nem sikerült betölteni a kategóriáidat",
  },
  detail: {
    title: "Tranzakció",
    type: "Típus",
    category: "Kategória",
    date: "Dátum",
    paidIn: "Fizetve",
    inYourCurrency: "A te pénznemedben",
    exchangeRate: "Árfolyam",
    rate: "1 {{currency}} = {{rate}} {{base}}",
    added: "Létrehozva",
    lastChanged: "Utoljára módosítva",
    edit: "Szerkesztés",
    delete: "Törlés",
  },
};
