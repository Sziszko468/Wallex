import { apiClient } from "./apiClient";
import type { PaginatedResponse } from "../types/api";
import type {
  MfaSetup,
  MfaStatus,
  PasswordChangePayload,
  RecoveryCodes,
  SecurityEvent,
  SecurityEventCategory,
  Session,
} from "../types/security";

/** The devices the account is signed in on. */
export async function listSessions(): Promise<Session[]> {
  const response = await apiClient.get<Session[]>("/auth/sessions/");
  return response.data;
}

/** Signs that device out; its tokens stop working immediately. */
export async function revokeSession(id: number): Promise<void> {
  await apiClient.delete(`/auth/sessions/${id}/`);
}

/** Every other device is signed out; this one stays signed in. */
export async function changePassword(payload: PasswordChangePayload): Promise<number> {
  const response = await apiClient.post<{ revoked_sessions: number }>("/auth/password/", payload);
  return response.data.revoked_sessions;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const response = await apiClient.get<MfaStatus>("/auth/2fa/");
  return response.data;
}

export async function startMfaSetup(password: string): Promise<MfaSetup> {
  const response = await apiClient.post<MfaSetup>("/auth/2fa/setup/", { password });
  return response.data;
}

export async function confirmMfa(code: string): Promise<RecoveryCodes> {
  const response = await apiClient.post<RecoveryCodes>("/auth/2fa/confirm/", { code });
  return response.data;
}

export async function disableMfa(password: string, code: string): Promise<void> {
  await apiClient.post("/auth/2fa/disable/", { password, code });
}

export async function regenerateRecoveryCodes(password: string, code: string): Promise<RecoveryCodes> {
  const response = await apiClient.post<RecoveryCodes>("/auth/2fa/recovery-codes/", { password, code });
  return response.data;
}

export async function listSecurityEvents(
  category?: SecurityEventCategory,
  page = 1
): Promise<PaginatedResponse<SecurityEvent>> {
  const response = await apiClient.get<PaginatedResponse<SecurityEvent>>("/auth/security-events/", {
    params: { category, page },
  });
  return response.data;
}
