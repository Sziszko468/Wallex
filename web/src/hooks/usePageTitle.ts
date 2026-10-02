import { useEffect } from "react";
import { APP_NAME } from "../config/app";

/** Sets the browser tab title for the current page ("Budgets · WALLEX") — it names the page for screen readers and history too. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
