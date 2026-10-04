import type { DeepStrings } from "../../types";
import type { assistant as en } from "../en/assistant";

export const assistant: DeepStrings<typeof en> = {
  welcome: "Mit szeretnél tudni a pénzedről?",
  description:
    "Kérdezz a kiadásaidról, költségkereteidről, előfizetéseidről és megtakarítási céljaidról. A válaszok kizárólag a te {{appName}}-adataidon alapulnak.",
  notConfigured: "Az AI asszisztens még nincs beállítva ezen a szerveren.",
  offline: "Offline vagy – az asszisztensnek kapcsolatra van szüksége.",
  gone: "Ez a beszélgetés már nem létezik – talán egy másik eszközön törölték.",
  toolbar: {
    history: "Előzmények",
    historyLabel: "Beszélgetések előzményei",
    newChat: "Új beszélgetés",
  },
  composer: {
    label: "Kérdezz a pénzügyeidről",
    placeholder: "Kérdezz a kiadásaidról…",
    send: "Küldés",
  },
  messages: {
    you: "Te: {{text}}",
    basedOn: "Ezen alapul",
    basedOnLabel: "Ezen alapul:",
    thinking: "Az adataid ellenőrzése",
    thinkingText: "Az adataid ellenőrzése…",
    insights: "Fontosabb számok",
    followUps: "Kérdezhetsz még",
  },
  insights: {
    tone: {
      warning: "Figyelmet igényel",
      positive: "Jó hír",
    },
    // What the percentage on a card is a percentage of.
    meaning: {
      total_spending: "a kiadásokból",
      largest_category: "a kiadásokból",
      category_spending: "a kiadásokból",
      top_merchant: "a kiadásokból",
      spending_change: "változás",
      spending_change_year: "változás",
      biggest_increase: "változás",
      over_budget: "felhasználva",
      closest_budget: "felhasználva",
      subscriptions_cost: "a kiadásokból",
      goal_progress: "teljesítve",
    },
  },
  suggestions: {
    label: "Javasolt kérdések",
    heading: "Próbáld ki",
  },
  history: {
    title: "Beszélgetések",
    empty: "A beszélgetéseid itt jelennek meg.",
    open: "Beszélgetés megnyitása: {{title}}",
    delete: "Beszélgetés törlése: {{title}}",
    deleteTitle: "Törlöd a beszélgetést?",
    deleteMessage: "„{{title}}” és az üzenetei minden eszközödről törlődnek.",
    today: "Ma, {{time}}",
  },
  errors: {
    timeout: "A válasz túl sokáig tartott. Kérjük, próbáld újra.",
    rateLimited: "Rövid idő alatt sok kérdést tettél fel. Kérjük, várj egy kicsit, majd próbáld újra.",
    offline: "Offline vagy. Az asszisztensnek kapcsolatra van szüksége az adataid megtekintéséhez.",
  },
};
