import type { DeepStrings } from "../../types";
import type { subscriptions as en } from "../en/subscriptions";

export const subscriptions: DeepStrings<typeof en> = {
  title: "Előfizetések",
  description: "Amit rendszeresen fizetsz, és amennyit ez összesen kitesz.",
  add: "Előfizetés hozzáadása",
  listLabel: "Előfizetések",
  toast: {
    saved: "Módosítások mentve",
    added: "Előfizetés hozzáadva",
    deleted: "Előfizetés törölve",
  },
  empty: {
    title: "Még nincs előfizetés",
    message:
      "Add hozzá a Netflixet, a Spotifyt, az edzőtermi bérletedet vagy a telefoncsomagodat, hogy lásd, valójában mennyibe kerülnek egy év alatt.",
  },
  summary: {
    monthly: "Havi előfizetések",
    yearly: "Éves előrejelzés",
    active: "Aktív előfizetések",
    activeWithPaused: "{{active}} · {{paused}} szüneteltetve",
    unconverted:
      "Nem szerepel az összesítésben: {{currencies}} pénznemben számlázott előfizetések – nincs árfolyam az elmúlt {{days}} napból.",
  },
  cards: {
    upcoming: "Következő {{days}} nap",
    byCategory: "Havi költség kategóriánként",
  },
  delete: {
    title: "Előfizetés törlése",
    message:
      "Törlöd ezt: „{{name}}”? A már rögzített kifizetések megmaradnak a tranzakcióid között. Ha meg szeretnéd őrizni az előzményeit, inkább adj meg utolsó fizetési dátumot.",
    messageShort: "Törlöd ezt: „{{name}}”? A már rögzített kifizetések megmaradnak a tranzakcióid között.",
  },
  status: {
    active: "Aktív",
    paused: "Szüneteltetve",
    ended: "Lejárt",
  },
  row: {
    noRate: "nincs árfolyam",
    noRateTitle: "Nincs friss árfolyam",
    perMonth: "hó",
  },
  upcomingList: {
    empty: "A következő {{days}} napban nincs esedékes fizetés.",
  },
  categoryList: {
    empty: "Nincs aktív előfizetés.",
  },
  detail: {
    backLink: "Összes előfizetés",
    fallbackTitle: "Előfizetés",
    noRateCost: "{{own}} (nincs árfolyam)",
    billing: "Számlázás",
    currency: "Pénznem",
    firstPayment: "Első fizetés",
    lastPayment: "Utolsó fizetés",
    openEnded: "Határozatlan ideig",
    nextPayment: "Következő fizetés",
    notes: "Megjegyzések",
    price: "Ár",
    monthlyCost: "Havi költség",
    yearlyCost: "Éves költség",
    details: "Részletek",
    upcoming: "Közelgő fizetések",
    pausedNoPayments: "Szüneteltetve – nincs közelgő fizetés.",
    noPayments: "Nincs közelgő fizetés.",
  },
  form: {
    addTitle: "Előfizetés hozzáadása",
    editTitle: "Előfizetés szerkesztése",
    namePlaceholder: "pl. Netflix, Spotify, Edzőterem",
    merchant: "Kereskedő (opcionális)",
    merchantPlaceholder: "pl. Netflix International B.V.",
    price: "Ár fizetésenként",
    billing: "Számlázás",
    firstPayment: "Első fizetés",
    lastPayment: "Utolsó fizetés (opcionális)",
    notes: "Megjegyzések (opcionális)",
    notesPlaceholder: "pl. Családi csomag, Annával közösen",
    active: "Aktív",
    activeHint: "A szüneteltetett előfizetések nem szerepelnek az összesítésekben.",
    submitAdd: "Előfizetés hozzáadása",
    submitSave: "Módosítások mentése",
  },
};
