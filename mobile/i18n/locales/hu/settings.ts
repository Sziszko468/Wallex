import type { DeepStrings } from "../../types";
import type { settings as en } from "../en/settings";

export const settings: DeepStrings<typeof en> = {
  title: "Beállítások",
  profile: {
    title: "Profil",
    email: "E-mail",
    firstName: "Keresztnév",
    lastName: "Vezetéknév",
    memberSince: "Tag ekkortól",
  },
  language: {
    title: "Nyelv",
    hint: "A fiókodhoz mentjük, így az értesítések és az asszisztens is ezt használják.",
  },
  currency: {
    title: "Pénznem",
    base: "Alap pénznem",
    hint: "Az összesítések, költségkeretek és ismétlődő összegek ebben a pénznemben jelennek meg. A {{appName}} webes alkalmazásában módosíthatod.",
  },
  notifications: {
    title: "Értesítések",
    hint: "Költségkeret-riasztások, fizetési emlékeztetők és fontos meglátások.",
    button: "Értesítési beállítások",
  },
  security: {
    title: "Biztonság",
    unlockWith: "Feloldás ezzel: {{method}}",
    requireHint_one: "Kérjük a {{appName}} megnyitásához, és ha {{count}} percre a háttérbe kerül.",
    requireHint_other: "Kérjük a {{appName}} megnyitásához, és ha {{count}} percre a háttérbe kerül.",
    setupHint: "A használatához állítsd be a(z) {{method}} funkciót az eszközöd beállításaiban.",
  },
  data: {
    title: "Az adataid",
    hint: "Töltsd le mindazt, amit a {{appName}} rólad tárol, vagy töröld végleg a fiókodat.",
    button: "Adataim kezelése",
    download: {
      button: "Adataim letöltése",
      confirmIdentity: "Erősítsd meg, hogy te vagy az, az adataid letöltéséhez.",
      submit: "Letöltés",
    },
    delete: {
      button: "Fiók törlése",
      warning:
        "Ez véglegesen törli a fiókodat és mindent, ami benne van: a tranzakciókat, költségkereteket, célokat és az előzményeket. Nem vonható vissza. Ha meg szeretnél őrizni egy másolatot, előbb töltsd le az adataidat.",
      confirmIdentity: "A megerősítéshez add meg a jelszavadat.",
      code: "Hitelesítő vagy helyreállító kód",
      submit: "Fiók végleges törlése",
    },
  },
  session: {
    title: "Munkamenet",
    hint: "Kijelentkezés a {{appName}} alkalmazásból ezen az eszközön.",
    unsynced_one:
      "{{count}} tranzakció még nincs szinkronizálva. Ha most kijelentkezel, elveszik – csatlakozz előbb az internethez, hogy megmaradjon.",
    unsynced_other:
      "{{count}} tranzakció még nincs szinkronizálva. Ha most kijelentkezel, elvesznek – csatlakozz előbb az internethez, hogy megmaradjanak.",
    logout: "Kijelentkezés",
    lostPhone: "Elveszett egy telefonod, vagy bejelentkeztél valahol, ahol nem kellett volna? Zárd le az összes munkamenetet egyszerre.",
    logoutAll: "Kijelentkezés minden eszközről",
    logoutAllMessage: "A fiókodba bejelentkezett minden telefon és böngésző kijelentkezik, ez is.",
    logoutAllConfirm: "Kijelentkezés mindenhonnan",
  },
  notificationSettings: {
    device: {
      title: "Ez az eszköz",
      unsupportedPlatform: "A push értesítések az iOS és Android alkalmazásban érhetők el.",
      push: "Push értesítések",
      pushHint: "{{appName}}-riasztások fogadása ezen a telefonon.",
      canAskAgain: "Az értesítések még nincsenek engedélyezve. Kapcsold be a kapcsolót az engedélyezéshez.",
      blocked: "Az értesítések ki vannak kapcsolva a(z) {{appName}} számára az eszközbeállításokban.",
      openSettings: "Eszközbeállítások megnyitása",
    },
    preferences: {
      title: "Értesítsen erről",
      subtitle: "Az összes eszközödre vonatkozik.",
      remind: "Emlékeztessen",
      days_one: "{{count}} nap",
      days_other: "{{count}} nap",
      daysBefore_one: "{{count}} nappal előtte",
      daysBefore_other: "{{count}} nappal előtte",
      after: "az előfizetés vagy más ismétlődő fizetés esedékessége előtt.",
    },
    toggles: {
      budget_warnings: {
        label: "Költségkeret majdnem elfogyott",
        hint: "Amikor a költségkeret eléri a {{percent}}%-ot.",
      },
      budget_exceeded: {
        label: "Költségkeret túllépve",
        hint: "Amikor többet költesz a költségkeretnél.",
      },
      subscription_reminders: {
        label: "Előfizetések kifizetése",
        hint: "Az előfizetés terhelése előtt.",
      },
      recurring_reminders: {
        label: "Egyéb ismétlődő fizetések",
        hint: "A lakbér, a számlák és más ismétlődő kiadások esedékessége előtt.",
      },
      savings_goals: {
        label: "Megtakarítási célok",
        hint: "Mérföldkövek a cél felé vezető úton.",
      },
      unusual_spending: {
        label: "Szokatlan költés",
        hint: "Amikor egy kategória egyértelműen többe kerül a szokásosnál.",
      },
      monthly_summary: {
        label: "Havi összefoglaló",
        hint: "Az előző havi költések, a hónap elején.",
      },
      insights: {
        label: "Fontos meglátások",
        hint: "Például amikor a kiadások meghaladják a bevételt.",
      },
    },
    push: {
      channelName: "{{appName}}-riasztások",
      noProject: "A push értesítések nincsenek beállítva ehhez a buildhez (hiányzik az EAS-projektazonosító).",
      devBuild: "Ez a build nem tud push értesítéseket fogadni. Használj fejlesztői buildet valódi eszközön.",
    },
  },
  biometrics: {
    generic: "Biometrikus azonosítás",
    fingerprint: "Ujjlenyomat",
    unlockPrompt: "{{appName}} feloldása",
    enablePrompt: "{{method}} engedélyezése a(z) {{appName}} számára",
    cancel: "Mégse",
    notSetUp: "A(z) {{method}} nincs beállítva ezen az eszközön.",
    lockedOut: "Túl sok sikertelen próbálkozás – a(z) {{method}} átmenetileg zárolva van. Jelentkezz be inkább jelszóval.",
    removed: "A(z) {{method}} már nincs beállítva ezen az eszközön. Jelentkezz be inkább jelszóval.",
    failedVerify: "Nem tudtuk ellenőrizni, hogy te vagy-e. Kérjük, próbáld újra.",
    timedOut: "A kérés időtúllépés miatt megszakadt. Kérjük, próbáld újra.",
    didntWork: "A(z) {{method}} nem működött. Próbáld újra, vagy jelentkezz be jelszóval.",
  },
};
