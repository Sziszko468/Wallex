import { apiClient } from "./apiClient";
import type { PaginatedResponse } from "../types/api";
import type {
  AppNotification,
  MarkAllReadResult,
  NotificationListParams,
  NotificationPreferences,
  NotificationPreferencesUpdate,
  UnreadCount,
} from "../types/notification";

/** The in-app inbox, newest first, paginated. */
export async function listNotifications(
  params?: NotificationListParams
): Promise<PaginatedResponse<AppNotification>> {
  const response = await apiClient.get<PaginatedResponse<AppNotification>>("/notifications/", { params });
  return response.data;
}

/** For the badge on the notifications icon. */
export async function getUnreadNotificationCount(): Promise<number> {
  const response = await apiClient.get<UnreadCount>("/notifications/unread-count/");
  return response.data.unread_count;
}

export async function setNotificationRead(id: number, isRead: boolean): Promise<AppNotification> {
  const response = await apiClient.patch<AppNotification>(`/notifications/${id}/`, { is_read: isRead });
  return response.data;
}

export async function markAllNotificationsRead(): Promise<MarkAllReadResult> {
  const response = await apiClient.post<MarkAllReadResult>("/notifications/mark-all-read/");
  return response.data;
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
