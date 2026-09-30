import { useEffect } from "react";

const APP_NAME = "Spendly";

/** Sets the browser tab title for the current page ("Budgets · Spendly") — it names the page for screen readers and history too. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
