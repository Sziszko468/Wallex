import type { DeepStrings } from "../../types";
import type { settings as en } from "../en/settings";

export const settings: DeepStrings<typeof en> = {
  title: "Beállítások",
  description: "A profilod, a {{appName}} megjelenése és a pénzösszegek megjelenítése.",
  profile: {
    title: "Profil",
    fallbackName: "A fiókod",
    email: "E-mail",
    firstName: "Keresztnév",
    lastName: "Vezetéknév",
    memberSince: "Tag ekkortól",
  },
  appearance: {
    title: "Megjelenés",
    hint: "A „Rendszer” az eszközöd világos vagy sötét beállítását követi, akkor is, ha az napnyugtakor változik.",
  },
  language: {
    title: "Nyelv",
    hint: "Az alkalmazás nyelve. A fiókodhoz mentjük, így az értesítések és az asszisztens is ezt használják.",
  },
  currency: {
    title: "Pénznem",
    hint: "Az összesítések, költségkeretek és ismétlődő összegek az alap pénznemedben jelennek meg. Minden tranzakció megtartja azt a pénznemet, amelyben kifizették.",
    baseCurrency: "Alap pénznem",
    change: "Alap pénznem módosítása",
    changed: "Az alap pénznemed mostantól {{currency}}. Az összesítéseket, költségkereteket és ismétlődő összegeket átváltottuk.",
    confirmTitle: "Átváltás {{currency}} pénznemre?",
    confirmMessage:
      "Az összesítések {{from}} helyett {{to}} pénznemben jelennek meg. Minden tranzakciót a saját napjának EKB-árfolyamán váltunk át; a költségkereteket és az ismétlődő összegeket a legfrissebb árfolyamon. A tranzakciók eredeti összege nem változik.",
    confirmLabel: "Pénznem átváltása",
  },
  security: {
    title: "Biztonság",
    hint: "Bejelentkezett eszközök, kijelentkezés mindenhonnan, jelszó, kétlépcsős azonosítás és legutóbbi bejelentkezések.",
    manage: "Biztonság kezelése",
  },
  session: {
    title: "Munkamenet",
    hint: "Kijelentkezés a {{appName}} alkalmazásból ezen az eszközön.",
  },
};
