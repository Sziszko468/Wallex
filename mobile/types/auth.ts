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

export interface AuthTokens {
  access: string;
  refresh: string;
}

/** The password was right, but two-factor authentication is on: a code is needed. */
export interface MfaChallenge {
  mfa_required: true;
  mfa_token: string;
  expires_in: number;
}

export type LoginResult = AuthTokens | MfaChallenge;

export interface MfaLoginPayload {
  mfa_token: string;
  /** Authenticator code, or an unused recovery code. */
  code: string;
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
