import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { currentLanguage, i18n } from "../i18n";
import { isLanguage, storeLanguage, type Language } from "../i18n/languages";
import { useAuth } from "./useAuth";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function applyLanguage(language: Language) {
  void i18n.changeLanguage(language);
  storeLanguage(language);
}

/**
 * Owns the interface language. Once signed in, the account's language wins (it is what the
 * phone, the notifications and the assistant use too); a change made here is saved to the
 * account. Must sit inside AuthProvider.
 *
 * Everything below is remounted when the language changes: text, dates and numbers are all
 * formatted fresh, and every view reloads its data — including the texts the server writes.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  useTranslation(); // re-render on a language change
  const { user, changeLanguage } = useAuth();
  const language = currentLanguage();
  const accountLanguage = user?.language;

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

  return (
    <LanguageContext.Provider value={value}>
      <Fragment key={language}>{children}</Fragment>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
