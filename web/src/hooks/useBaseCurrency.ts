import { useAuth } from "./useAuth";
import type { CurrencyCode } from "../types/currency";

/** The signed-in user's base currency: the currency of every total the API returns. */
export function useBaseCurrency(): CurrencyCode {
  return useAuth().user?.base_currency ?? "EUR";
}
