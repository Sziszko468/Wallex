export type DevicePlatform = "ios" | "android";

export interface Device {
  id: number;
  expo_push_token: string;
  platform: DevicePlatform;
  name: string;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
}

export interface RegisterDevicePayload {
  expo_push_token: string;
  platform: DevicePlatform;
  name?: string;
}

/** Which notifications the user wants — applies to all of their devices. */
export interface NotificationPreferences {
  budget_warnings: boolean;
  budget_exceeded: boolean;
  recurring_reminders: boolean;
  insights: boolean;
  /** 1–7: how many days before a recurring expense the reminder arrives. */
  recurring_reminder_days: number;
  updated_at: string;
}

export type NotificationPreferencesUpdate = Partial<Omit<NotificationPreferences, "updated_at">>;

export type NotificationKind = "budget_warning" | "budget_exceeded" | "recurring_due" | "insight";

/** Screens a push notification can deep-link to (the `data.screen` field sent by the backend). */
export type NotificationScreen = "budgets" | "recurring" | "dashboard";
