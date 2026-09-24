import axios from "axios";
import { apiClient, API_BASE_URL } from "./apiClient";
import type { AuthTokens, LoginPayload, RegisterPayload, User } from "../types/auth";

const AUTH_TIMEOUT_MS = 15_000;

export async function login(payload: LoginPayload): Promise<AuthTokens> {
  // Bare axios (not apiClient): there is no session to attach or refresh yet.
  const response = await axios.post<AuthTokens>(`${API_BASE_URL}/auth/login/`, payload, {
    timeout: AUTH_TIMEOUT_MS,
  });
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
