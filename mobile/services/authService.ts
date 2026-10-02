import axios from "axios";
import { Platform } from "react-native";
import { apiClient, API_BASE_URL } from "./apiClient";
import type {
  AuthTokens,
  LoginPayload,
  LoginResult,
  MfaLoginPayload,
  RegisterPayload,
  UpdateUserPayload,
  User,
} from "../types/auth";

const AUTH_TIMEOUT_MS = 15_000;

// Labels the new session in the account's device list ("iPhone app", "Android app").
const SIGN_IN_REQUEST = { timeout: AUTH_TIMEOUT_MS, headers: { "X-Client-Platform": Platform.OS } };

/** Password step: tokens, or — with two-factor authentication on — a challenge for `verifyMfa`. */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  // Bare axios (not apiClient): there is no session to attach or refresh yet.
  const response = await axios.post<LoginResult>(`${API_BASE_URL}/auth/login/`, payload, SIGN_IN_REQUEST);
  return response.data;
}

export async function verifyMfa(payload: MfaLoginPayload): Promise<AuthTokens> {
  const response = await axios.post<AuthTokens>(`${API_BASE_URL}/auth/login/verify/`, payload, SIGN_IN_REQUEST);
  return response.data;
}

export async function register(payload: RegisterPayload): Promise<User> {
  const response = await axios.post<User>(`${API_BASE_URL}/auth/register/`, payload, {
    timeout: AUTH_TIMEOUT_MS,
  });
  return response.data;
}

export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<User>("/auth/me/");
  return response.data;
}

/** Saves a profile setting (the interface language) on the account. */
export async function updateCurrentUser(payload: UpdateUserPayload): Promise<User> {
  const response = await apiClient.patch<User>("/auth/me/", payload);
  return response.data;
}
