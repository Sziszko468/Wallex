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

/** Which notifications the user wants (one switch per kind) — applies to all of their devices. */
export interface NotificationPreferences {
  budget_warnings: boolean;
  budget_exceeded: boolean;
  subscription_reminders: boolean;
  recurring_reminders: boolean;
  savings_goals: boolean;
  unusual_spending: boolean;
  monthly_summary: boolean;
  insights: boolean;
  /** 1–7: how many days before a subscription or other recurring payment the reminder arrives. */
  recurring_reminder_days: number;
  updated_at: string;
}

export type NotificationPreferencesUpdate = Partial<Omit<NotificationPreferences, "updated_at">>;

export type NotificationKind =
  | "budget_warning"
  | "budget_exceeded"
  | "subscription_due"
  | "recurring_due"
  | "savings_goal"
  | "unusual_spending"
  | "monthly_summary"
  | "insight";

/** Screens a notification can lead to (the `data.screen` field sent by the backend). */
export type NotificationScreen =
  | "budgets"
  | "subscriptions"
  | "recurring"
  | "savings_goals"
  | "transactions"
  | "dashboard";

export type RelatedObjectType = "budget" | "subscription" | "recurring_transaction" | "savings_goal" | "category";

/** What a notification is about. The object may have been deleted since. */
export interface RelatedObject {
  type: RelatedObjectType;
  id: number;
}

/**
 * An in-app notification. Decided and written by the backend: show `title` and `body` as they
 * are (amounts are already formatted), never rebuild them on the client.
 */
export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  related_object: RelatedObject | null;
  /** Navigation hints: `screen` plus the ids / `year` / `month` that screen needs. */
  data: Record<string, unknown>;
  created_at: string;
}

export interface NotificationListParams {
  page?: number;
  page_size?: number;
  is_read?: boolean;
  kind?: NotificationKind;
}

export interface UnreadCount {
  unread_count: number;
}

export interface MarkAllReadResult {
  marked: number;
}
