import type { DeepStrings } from "../../types";
import type { auth as en } from "../en/auth";

export const auth: DeepStrings<typeof en> = {
  layout: {
    headline: "Nyugodtabb módja annak, hogy lásd, hová megy a pénzed.",
    subline: "Kövesd a kiadásaidat, tartsd be a költségkereteidet és haladj a céljaid felé – felesleges zaj nélkül.",
  },
  fields: {
    email: "E-mail",
    password: "Jelszó",
    firstName: "Keresztnév",
    lastName: "Vezetéknév",
    confirmPassword: "Jelszó megerősítése",
  },
  login: {
    title: "Bejelentkezés",
    subtitle: "Üdv újra! Folytasd ott, ahol abbahagytad.",
    submit: "Bejelentkezés",
    noAccount: "Még nincs fiókod?",
    registerLink: "Regisztráció",
  },
  mfa: {
    title: "Kétlépcsős azonosítás",
    subtitle: "Add meg a hitelesítő alkalmazásod {{digits}} jegyű kódját, vagy az egyik helyreállítási kódodat.",
    code: "Hitelesítési kód",
    verify: "Ellenőrzés",
    differentAccount: "Másik fiók használata",
  },
  register: {
    title: "Fiók létrehozása",
    subtitle: "Egy percet vesz igénybe, és az adataid a tieid maradnak.",
    submit: "Regisztráció",
    haveAccount: "Már van fiókod?",
    loginLink: "Bejelentkezés",
  },
  userMenu: {
    accountMenu: "Fiókmenü, {{name}}",
  },
};
