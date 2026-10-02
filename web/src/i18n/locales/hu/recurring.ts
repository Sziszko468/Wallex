import type { DeepStrings } from "../../types";
import type { recurring as en } from "../en/recurring";

export const recurring: DeepStrings<typeof en> = {
  title: "Ismétlődő tranzakciók",
  description: "Bevételek és kifizetések, amelyek ütemezés szerint ismétlődnek.",
  add: "Ismétlődő tranzakció hozzáadása",
  listLabel: "Ismétlődő tranzakciók",
  subscriptionBadge: "Előfizetés",
  paused: "Szüneteltetve",
  next: "Következő: {{date}}",
  pause: "{{name}} szüneteltetése",
  resume: "{{name}} folytatása",
  toast: {
    saved: "Módosítások mentve",
    added: "Ismétlődő tranzakció hozzáadva",
    deleted: "Ismétlődő tranzakció törölve",
  },
  empty: {
    title: "Még nincs ismétlődő tranzakció",
    message: "Add hozzá a lakbért, a fizetésedet vagy a rendszeres számláidat, hogy nyomon kövesd mindazt, ami ismétlődik.",
  },
  delete: {
    title: "Ismétlődő tranzakció törlése",
  },
  frequency: {
    weekly: "Hetente",
    monthly: "Havonta",
    yearly: "Évente",
  },
  period: {
    weekly: "hét",
    monthly: "hó",
    yearly: "év",
  },
  form: {
    addTitle: "Ismétlődő tranzakció hozzáadása",
    editTitle: "Ismétlődő tranzakció szerkesztése",
    namePlaceholder: "pl. Lakbér, Netflix, Spotify",
    frequency: "Gyakoriság",
    startDate: "Kezdő dátum",
    endDate: "Befejező dátum (opcionális)",
    descriptionPlaceholder: "pl. Lakás a Fő utcában",
    active: "Aktív",
    activeHint: "A szüneteltetett tételekről nem küldünk fizetési emlékeztetőt.",
    submitAdd: "Ismétlődő tranzakció hozzáadása",
    submitSave: "Módosítások mentése",
    errors: {
      startRequired: "A kezdő dátum megadása kötelező.",
      endBeforeStart: "A befejező dátum nem lehet a kezdő dátum előtt.",
    },
  },
};
