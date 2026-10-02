import type { DeepStrings } from "../../types";
import type { security as en } from "../en/security";

export const security: DeepStrings<typeof en> = {
  page: {
    title: "Biztonság",
    description: "Hol vagy bejelentkezve, és hogyan védjük a fiókodat.",
  },
  devices: {
    title: "Bejelentkezett eszközök",
    hint: "Jelentkeztess ki minden eszközt, amelyet nem ismersz fel. A hozzáférése azonnal megszűnik.",
    platforms: {
      web: "Böngésző",
      ios: "iPhone-alkalmazás",
      android: "Android-alkalmazás",
      unknown: "Egyéb eszköz",
    },
    thisDevice: "Ez az eszköz",
    unknownApp: "Ismeretlen alkalmazás",
    activity: "Bejelentkezve: {{signedIn}} · utoljára aktív: {{lastActive}}",
    signOut: "Kijelentkeztetés",
    signOutLabel: "{{platform}} kijelentkeztetése (bejelentkezve: {{signedIn}})",
    logOutAll: "Kijelentkezés minden eszközről",
    confirmTitle: "Kijelentkezés minden eszközről?",
    confirmMessage:
      "A fiókodba bejelentkezett minden böngésző és telefon kijelentkezik, ez is. Az újbóli bejelentkezéshez szükséged lesz a jelszavadra.",
    confirmLabel: "Kijelentkezés mindenhonnan",
  },
  history: {
    title: "Legutóbbi bejelentkezések",
    hint: "Olyan próbálkozást látsz, amelyet nem ismersz fel? Változtasd meg a jelszavadat, és kapcsold be a kétlépcsős azonosítást.",
    empty: "Még nincs rögzített bejelentkezés.",
  },
  password: {
    title: "Jelszó",
    hint: "Legalább {{count}} karakter – néhány egymással nem összefüggő szó erős, könnyen megjegyezhető jelmondatot ad. A módosítással kijelentkeztetjük a többi eszközödet.",
    current: "Jelenlegi jelszó",
    new: "Új jelszó",
    repeat: "Az új jelszó ismét",
    submit: "Jelszó módosítása",
    mismatch: "Az új jelszavak nem egyeznek.",
    changed: "A jelszó módosítva.",
    changedSignedOut_one: "A jelszó módosítva. {{count}} másik eszközt kijelentkeztettünk.",
    changedSignedOut_other: "A jelszó módosítva. {{count}} másik eszközt kijelentkeztettünk.",
  },
  twoFactor: {
    title: "Kétlépcsős azonosítás",
    hint: "A bejelentkezéskor egy hitelesítő alkalmazás (Google Authenticator, Microsoft Authenticator, 1Password…) kódját is kérjük, így egy ellopott jelszó önmagában nem elég.",
    enable: "Kétlépcsős azonosítás bekapcsolása",
    confirmIdentity: "Erősítsd meg, hogy te vagy, a beállítás megkezdéséhez.",
    continue: "Tovább",
    setupInstructions:
      "Add hozzá a {{appName}} alkalmazást a hitelesítő appodhoz: a telefonodon <a>nyisd meg ezt a beállítási linket</a>, vagy írd be ezt a kulcsot:",
    setupKeyLabel: "Beállítási kulcs",
    codeFromApp: "Az alkalmazás kódja",
    turnOn: "Bekapcsolás",
    turnOffWarning: "Ha kikapcsolod, a jelszavad lesz az egyetlen, ami a fiókodat védi.",
    regenerateWarning: "Az új kódok lecserélik az összes jelenlegi helyreállítási kódodat.",
    codeOrRecovery: "Hitelesítő vagy helyreállítási kód",
    turnOff: "Kikapcsolás",
    createNewCodes: "Új kódok létrehozása",
    newRecoveryCodes: "Új helyreállítási kódok",
    status_one: "Bekapcsolva: {{since}} óta · {{count}} helyreállítási kód maradt",
    status_other: "Bekapcsolva: {{since}} óta · {{count}} helyreállítási kód maradt",
    codes: {
      saveInstructions:
        "<strong>Mentsd el ezeket a helyreállítási kódokat</strong> biztonságos helyre (például jelszókezelőbe). Mindegyik egyszer beléptet, ha elveszíted a telefonodat. Többé nem jelennek meg.",
      listLabel: "Helyreállítási kódok",
      saved: "Elmentettem őket",
    },
  },
};
