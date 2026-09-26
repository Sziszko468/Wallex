import type { CurrencyCode } from "./currency";

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  /** Currency of every total, budget, recurring amount and transaction `base_amount`. */
  base_currency: CurrencyCode;
}

/** Body for PATCH /api/auth/me/ — only the base currency is writable. */
export interface UpdateUserPayload {
  base_currency: CurrencyCode;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  password_confirm: string;
  first_name?: string;
  last_name?: string;
}
