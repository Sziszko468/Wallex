import axios from "axios";
import { apiClient, API_BASE_URL } from "./apiClient";
import type { AuthTokens, LoginPayload, RegisterPayload, UpdateUserPayload, User } from "../types/auth";

export async function login(payload: LoginPayload): Promise<AuthTokens> {
  // Uses a bare axios call (not apiClient) so the response-interceptor's
  // refresh logic never applies to the login request itself.
  const response = await axios.post<AuthTokens>(`${API_BASE_URL}/auth/login/`, payload);
  return response.data;
}

export async function register(payload: RegisterPayload): Promise<User> {
  const response = await axios.post<User>(`${API_BASE_URL}/auth/register/`, payload);
  return response.data;
}

export async function logout(refresh: string): Promise<void> {
  await apiClient.post("/auth/logout/", { refresh });
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
