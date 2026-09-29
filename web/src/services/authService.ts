import axios from "axios";
import { apiClient, API_BASE_URL, AUTH_REQUEST } from "./apiClient";
import type {
  AccessToken,
  LoginPayload,
  LoginResult,
  MfaLoginPayload,
  RegisterPayload,
  UpdateUserPayload,
  User,
} from "../types/auth";

/**
 * Password step. Either signs in (the refresh token arrives as an HttpOnly cookie) or, with
 * two-factor authentication on, answers with a challenge for `verifyMfa`.
 */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  // A bare axios call (not apiClient): the refresh-on-401 logic must not apply to signing in.
  const response = await axios.post<LoginResult>(`${API_BASE_URL}/auth/login/`, payload, AUTH_REQUEST);
  return response.data;
}

export async function verifyMfa(payload: MfaLoginPayload): Promise<AccessToken> {
  const response = await axios.post<AccessToken>(`${API_BASE_URL}/auth/login/verify/`, payload, AUTH_REQUEST);
  return response.data;
}

export async function register(payload: RegisterPayload): Promise<User> {
  const response = await axios.post<User>(`${API_BASE_URL}/auth/register/`, payload);
  return response.data;
}

/** Ends this browser's session on the server and clears the refresh cookie. */
export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout/", {}, AUTH_REQUEST);
}

/** Ends every session of the account: all phones, browsers and tabs. */
export async function logoutEverywhere(): Promise<number> {
  const response = await apiClient.post<{ revoked_sessions: number }>("/auth/logout-all/", {}, AUTH_REQUEST);
  return response.data.revoked_sessions;
}

export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<User>("/auth/me/");
  return response.data;
}

/** Changing the base currency converts the user's data on the server (can take a moment). */
export async function updateCurrentUser(payload: UpdateUserPayload): Promise<User> {
  const response = await apiClient.patch<User>("/auth/me/", payload);
  return response.data;
}
