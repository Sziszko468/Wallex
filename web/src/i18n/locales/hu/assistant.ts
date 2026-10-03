import type { DeepStrings } from "../../types";
import type { assistant as enAssistant, importCsv as enImport } from "../en/assistant";

export const assistant: DeepStrings<typeof enAssistant> = {
  title: "AI asszisztens",
  description:
    "Kérdezz a kiadásaidról, költségkereteidről, előfizetéseidről és megtakarítási céljaidról. A válaszok kizárólag a te {{appName}}-adataidon alapulnak.",
  history: "Előzmények",
  hideHistory: "Előzmények elrejtése",
  newChat: "Új beszélgetés",
  loadingConversation: "Beszélgetés betöltése",
  gone: "Ez a beszélgetés már nem létezik – talán egy másik eszközön törölték.",
  startNew: "Új beszélgetés indítása",
  welcome: "Mit szeretnél tudni a pénzedről?",
  chat: "Beszélgetés",
  notConfigured:
    "Az AI asszisztens még nincs beállítva ezen a szerveren: modell API-kulcsra (ANTHROPIC_API_KEY) van szüksége.",
  disclaimer:
    "Az asszisztens csak olvassa az adataidat – semmit nem tud módosítani. Tévedhet, ezért a fontos számokat ellenőrizd az alkalmazásban.",
  deleteDialog: {
    title: "Törlöd a beszélgetést?",
    message: "„{{title}}” és az üzenetei minden eszközödről törlődnek. Ez nem vonható vissza.",
  },
  composer: {
    label: "Kérdezz a pénzügyeidről",
    placeholder: "pl. Mire költöttem többet, mint előző hónapban?",
    send: "Küldés",
  },
  messages: {
    basedOn: "Ezen alapul",
    conversation: "Beszélgetés",
    you: "Te",
    assistant: "Asszisztens",
    thinking: "Az adataid ellenőrzése",
  },
  suggestions: {
    label: "Javasolt kérdések",
    heading: "Próbáld ki",
  },
  list: {
    label: "Beszélgetések előzményei",
    empty: "A beszélgetéseid itt jelennek meg.",
    delete: "Beszélgetés törlése: {{title}}",
    showOlder: "Régebbiek megjelenítése",
    today: "Ma, {{time}}",
  },
  errors: {
    timeout: "A válasz túl sokáig tartott. Kérjük, próbáld újra.",
    rateLimited: "Rövid idő alatt sok kérdést tettél fel. Kérjük, várj egy kicsit, majd próbáld újra.",
  },
};

export const importCsv: DeepStrings<typeof enImport> = {
  title: "Tranzakciók importálása",
  description: "Hozz be egy CSV-fájlt a bankodból vagy egy másik alkalmazásból.",
  uploadTitle: "CSV-fájl feltöltése",
  help:
    "Elvárt oszlopok: <code>date</code>, <code>description</code>, <code>amount</code>. A dátum <code>YYYY-MM-DD</code> vagy <code>DD/MM/YYYY</code> formátumú. Az összeg előjeles – kiadásnál negatív, bevételnél pozitív (pl. <code>-42.50</code>), az alap pénznemedben ({{currency}}). A kategóriát a leírás alapján automatikusan felismerjük (pl. „Albert Heijn” → Élelmiszer, „Shell” → Közlekedés, „Netflix” → Szórakozás); a nem azonosítható kiadás az „Egyéb” kategóriába kerül. A magyar bankok exportja módosítás nélkül is jó: <code>Dátum</code>, <code>Közlemény</code>, <code>Összeg</code> oszlopok, pontosvesszővel elválasztva, tizedesvesszővel (<code>-12 345,67</code>) és <code>2026.09.10.</code> formátumú dátummal.",
  notCsv: "Ez nem tűnik CSV-fájlnak. Válassz egy .csv végződésű fájlt.",
  imported_one: "{{count}} tranzakció importálva",
  imported_other: "{{count}} tranzakció importálva",
  choose: "CSV-fájl kiválasztása",
  ready: "Készen áll az importálásra",
  dragHint: "vagy húzd ide",
  submit: "Importálás",
  resultTitle: "Importálás eredménye",
  result: {
    imported: "Importálva",
    skipped: "Kihagyva",
    failed: "Sikertelen",
    row: "Sor",
    reason: "Ok",
  },
};
