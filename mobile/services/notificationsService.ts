import { apiClient } from "./apiClient";
import type {
  Device,
  NotificationPreferences,
  NotificationPreferencesUpdate,
  RegisterDevicePayload,
} from "../types/notification";

/** Idempotent: re-registering the same push token refreshes the existing device. */
export async function registerDevice(payload: RegisterDevicePayload): Promise<Device> {
  const response = await apiClient.post<Device>("/devices/", payload);
  return response.data;
}

export async function deleteDevice(id: number): Promise<void> {
  await apiClient.delete(`/devices/${id}/`);
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await apiClient.get<NotificationPreferences>("/notifications/preferences/");
  return response.data;
}

export async function updateNotificationPreferences(
  payload: NotificationPreferencesUpdate
): Promise<NotificationPreferences> {
  const response = await apiClient.patch<NotificationPreferences>("/notifications/preferences/", payload);
  return response.data;
}
