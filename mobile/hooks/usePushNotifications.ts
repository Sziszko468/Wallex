import { useEffect } from "react";
import { router, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import { isPushSupportedPlatform, syncPushRegistration } from "../services/pushNotifications";
import type { NotificationScreen } from "../types/notification";

const ROUTES: Record<NotificationScreen, Href> = {
  budgets: "/budgets",
  recurring: "/recurring",
  dashboard: "/dashboard",
};

function routeFor(data: Record<string, unknown> | undefined): Href | null {
  const screen = data?.screen;
  return typeof screen === "string" && screen in ROUTES ? ROUTES[screen as NotificationScreen] : null;
}

/**
 * Mounted by the signed-in app layout (so only after login / biometric unlock):
 * registers the device and opens the screen a tapped notification points to —
 * including a tap that launched the app from a killed state.
 */
function useNativePushNotifications(): void {
  useEffect(() => {
    void syncPushRegistration({ askPermission: true });
  }, []);

  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const route = routeFor(lastResponse.notification.request.content.data);
    // Consume it, so re-mounting (e.g. after a biometric re-lock) doesn't navigate again.
    Notifications.clearLastNotificationResponse();
    if (route) router.push(route);
  }, [lastResponse]);
}

// Chosen once per platform, so the hook order never changes between renders.
export const usePushNotifications: () => void = isPushSupportedPlatform
  ? useNativePushNotifications
  : () => {};
