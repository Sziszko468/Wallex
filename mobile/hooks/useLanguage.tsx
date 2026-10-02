import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { currentLanguage, i18n } from "../i18n";
import { isLanguage, type Language } from "../i18n/languages";
import { readStoredLanguage, storeLanguage } from "../utils/languageStorage";
import { useAuth } from "./useAuth";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function applyLanguage(language: Language) {
  void i18n.changeLanguage(language);
  void storeLanguage(language);
}

/**
 * Owns the interface language. The app starts in the device's language, then switches to the
 * choice saved on this device. Once signed in, the account's language wins (it is what the web
 * app, the notifications and the assistant use too); a change made here is saved to the account.
 * Must sit inside AuthProvider.
 *
 * Nothing is remounted on a change (that would send the user back to the first screen):
 * texts re-render through useTranslation, and every data hook reloads (see useAsyncData) so the
 * texts the server writes arrive in the new language.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  useTranslation(); // re-render on a language change
  const { user, changeLanguage } = useAuth();
  const language = currentLanguage();
  const accountLanguage = user?.language;

  useEffect(() => {
    let isCurrent = true;
    void readStoredLanguage().then((stored) => {
      if (isCurrent && stored && stored !== currentLanguage()) void i18n.changeLanguage(stored);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (isLanguage(accountLanguage) && accountLanguage !== currentLanguage()) applyLanguage(accountLanguage);
  }, [accountLanguage]);

  const setLanguage = useCallback(
    (next: Language) => {
      applyLanguage(next);
      if (user && user.language !== next) {
        // A preference, not data: if saving fails, it still holds on this device.
        void changeLanguage(next).catch(() => undefined);
      }
    },
    [user, changeLanguage]
  );

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
