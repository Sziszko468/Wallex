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
