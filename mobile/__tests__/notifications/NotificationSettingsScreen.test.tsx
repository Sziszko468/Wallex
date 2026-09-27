/**
 * The settings screen is a thin view of the backend's preferences: one switch per field it
 * receives, and a PATCH of exactly the field that was toggled.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { NotificationSettingsScreen } from "../../screens/NotificationSettingsScreen";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../../services/notificationsService";
import type { NotificationPreferences } from "../../types/notification";

jest.mock("../../services/notificationsService", () => ({
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
}));
jest.mock("../../services/pushNotifications", () => ({
  isPushSupportedPlatform: false,
  syncPushRegistration: jest.fn(),
  enablePush: jest.fn(),
  disablePush: jest.fn(),
}));

const mockedGet = getNotificationPreferences as jest.MockedFunction<typeof getNotificationPreferences>;
const mockedUpdate = updateNotificationPreferences as jest.MockedFunction<typeof updateNotificationPreferences>;

const defaults: NotificationPreferences = {
  budget_warnings: true,
  budget_exceeded: true,
  subscription_reminders: true,
  recurring_reminders: true,
  savings_goals: true,
  unusual_spending: true,
  monthly_summary: true,
  insights: true,
  recurring_reminder_days: 2,
  updated_at: "2026-09-27T10:00:00Z",
};

beforeEach(() => {
  mockedGet.mockReset().mockResolvedValue(defaults);
  mockedUpdate.mockReset();
});

describe("NotificationSettingsScreen", () => {
  it("shows a switch for every kind of notification", async () => {
    await render(<NotificationSettingsScreen />);

    for (const label of [
      "Budget almost used",
      "Budget exceeded",
      "Subscription payments",
      "Other recurring payments",
      "Savings goals",
      "Unusual spending",
      "Monthly summary",
      "Important insights",
    ]) {
      expect(await screen.findByLabelText(label)).toBeTruthy();
    }
  });

  it("saves exactly the switch that was turned off", async () => {
    mockedUpdate.mockResolvedValue({ ...defaults, monthly_summary: false });
    await render(<NotificationSettingsScreen />);

    // A Switch reports changes through onValueChange, not a press.
    await fireEvent(await screen.findByLabelText("Monthly summary"), "valueChange", false);

    expect(mockedUpdate).toHaveBeenCalledWith({ monthly_summary: false });
  });

  it("keeps the reminder timing while only subscription reminders are on", async () => {
    mockedGet.mockResolvedValue({ ...defaults, recurring_reminders: false });
    await render(<NotificationSettingsScreen />);

    expect(await screen.findByText("before a subscription or other recurring payment is due.")).toBeTruthy();
  });
});
