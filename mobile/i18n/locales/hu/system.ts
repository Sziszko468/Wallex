import type { DeepStrings } from "../../types";
import type { errors as enErrors, offline as enOffline, screens as enScreens, tabs as enTabs } from "../en/system";

export const tabs: DeepStrings<typeof enTabs> = {
  dashboard: "Kezdőlap",
  assistant: "Asszisztens",
  transactions: "Tranzakciók",
  recurring: "Ismétlődők",
  budgets: "Költségkeretek",
  settings: "Beállítások",
};

export const screens: DeepStrings<typeof enScreens> = {
  addTransaction: "Tranzakció hozzáadása",
  editTransaction: "Tranzakció szerkesztése",
  transactionDetails: "Tranzakció részletei",
  addRecurring: "Ismétlődő tranzakció hozzáadása",
  editRecurring: "Ismétlődő tranzakció szerkesztése",
  scanReceipt: "Blokk beolvasása",
  notifications: "Értesítések",
};

export const offline: DeepStrings<typeof enOffline> = {
  banner: {
    offline: "Offline vagy. {{saved}}{{waiting}}",
    savedAt: "A(z) {{time}} időpontban mentett adatok láthatók.",
    savedGeneric: "A mentett adatok láthatók.",
    waiting_one: " {{count}} tranzakciót szinkronizálunk, ha újra online leszel.",
    waiting_other: " {{count}} tranzakciót szinkronizálunk, ha újra online leszel.",
    failed_one: "{{count}} tranzakciót nem sikerült szinkronizálni.",
    failed_other: "{{count}} tranzakciót nem sikerült szinkronizálni.",
    syncing_one: "{{count}} tranzakció szinkronizálása…",
    syncing_other: "{{count}} tranzakció szinkronizálása…",
    pending_one: "{{count}} tranzakció vár a szinkronizálásra.",
    pending_other: "{{count}} tranzakció vár a szinkronizálásra.",
    review: "Áttekintés",
    syncNow: "Szinkronizálás most",
  },
  categoryGone:
    "A kategóriája már nem létezik (közben törölték vagy módosították). Vesd el, és add hozzá újra másik kategóriával.",
};

export const errors: DeepStrings<typeof enErrors> = {
  network: "Hálózati hiba – ellenőrizd a kapcsolatot, és próbáld újra.",
  generic: "Valami hiba történt. Kérjük, próbáld újra.",
  timeout: "A szerver túl sokáig nem válaszolt. Kérjük, próbáld újra.",
  sessionExpired: "A munkameneted lejárt. Kérjük, jelentkezz be újra.",
  signedOut: "Kijelentkeztettünk.",
  secureStorage: "A(z) {{appName}} nem fért hozzá az eszköz biztonságos tárolójához. Kérjük, próbáld újra.",
};
