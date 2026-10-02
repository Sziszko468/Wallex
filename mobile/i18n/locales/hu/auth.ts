import type { DeepStrings } from "../../types";
import type { auth as en } from "../en/auth";

export const auth: DeepStrings<typeof en> = {
  fields: {
    email: "E-mail",
    password: "Jelszó",
    firstName: "Keresztnév",
    lastName: "Vezetéknév",
    confirmPassword: "Jelszó megerősítése",
  },
  login: {
    title: "Bejelentkezés",
    submit: "Bejelentkezés",
    noAccount: "Még nincs fiókod?",
    registerLink: "Regisztráció",
  },
  register: {
    title: "Fiók létrehozása",
    submit: "Regisztráció",
    haveAccount: "Már van fiókod?",
    loginLink: "Bejelentkezés",
  },
  mfa: {
    title: "Kétlépcsős azonosítás",
    subtitle: "Add meg a hitelesítő alkalmazásod {{digits}} jegyű kódját, vagy az egyik helyreállítási kódodat.",
    code: "Hitelesítési kód",
    verify: "Ellenőrzés",
    differentAccount: "Másik fiók használata",
  },
  notices: {
    expired: "A munkameneted lejárt. Kérjük, jelentkezz be újra.",
    biometricsUnavailable:
      "A biometrikus feloldás ezen az eszközön már nem érhető el, ezért a biztonságod érdekében kijelentkeztettünk. Kérjük, jelentkezz be újra.",
    storageError: "Nem tudtuk beolvasni a mentett munkamenetedet. Kérjük, jelentkezz be újra.",
  },
  unlock: {
    heading: "A(z) {{appName}} zárolva van",
    text: "A folytatáshoz használd ezt: {{method}}.",
    unlockWith: "Feloldás ezzel: {{method}}",
    signInWithPassword: "Bejelentkezés jelszóval",
  },
  unavailable: {
    heading: "A(z) {{appName}} nem érhető el",
    text: "Ellenőrizd az internetkapcsolatot, és próbáld újra. Továbbra is be vagy jelentkezve.",
    tryAgain: "Újra",
    signOut: "Kijelentkezés",
  },
};
