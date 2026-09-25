import { Platform } from "react-native";
import axios from "axios";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { deleteDevice, registerDevice } from "./notificationsService";
import { extractErrorMessage } from "../utils/errors";
import {
  getPushDeviceId,
  getPushOptOut,
  setPushDeviceId,
  setPushOptOut,
} from "../utils/tokenStorage";
import type { DevicePlatform } from "../types/notification";
import { logWarning } from "../utils/logging";

/**
 * Push registration of this app installation.
 *
 * The backend decides what to send and when; the app only (1) obtains an Expo
 * push token with the user's permission and (2) tells the backend which
 * signed-in user this device belongs to. Web never registers — push is
 * mobile-only.
 */

// Must match ANDROID_CHANNEL_ID in backend/apps/notifications/services.py.
const ANDROID_CHANNEL_ID = "default";

export type PushStatus =
  | { state: "enabled" }
  | { state: "disabled" } // turned off by the user in the app
  | { state: "denied"; canAskAgain: boolean } // OS permission not granted
  | { state: "unsupported"; message: string }
  | { state: "error"; message: string };

export const isPushSupportedPlatform = Platform.OS === "ios" || Platform.OS === "android";

if (isPushSupportedPlatform) {
  // Show notifications that arrive while the app is open, too.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  // Android 13+ only shows the permission prompt once a channel exists.
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Spendly alerts",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

function getProjectId(): string | null {
  const fromConfig: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromConfig === "string") return fromConfig;
  return Constants.easConfig?.projectId ?? null;
}

/**
 * Registers this device with the backend if the user hasn't opted out and the
 * OS permission is granted (asking for it first when `askPermission` is set and
 * the OS still allows asking). Safe to call on every launch: it also refreshes
 * the device's `last_seen_at` and picks up a rotated push token.
 */
export async function syncPushRegistration({ askPermission }: { askPermission: boolean }): Promise<PushStatus> {
  if (!isPushSupportedPlatform) {
    return { state: "unsupported", message: "Push notifications are available in the iOS and Android app." };
  }

  try {
    if (await getPushOptOut()) return { state: "disabled" };

    await ensureAndroidChannel();
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && askPermission && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) {
      return { state: "denied", canAskAgain: permission.canAskAgain };
    }

    const projectId = getProjectId();
    if (!projectId) {
      return {
        state: "unsupported",
        message: "Push notifications aren't configured for this build (missing EAS project ID).",
      };
    }

    let token: string;
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (error) {
      // Simulators, and Expo Go on Android since SDK 53, can't get a push token.
      logWarning("Could not get an Expo push token", error);
      return {
        state: "unsupported",
        message: "This build can't receive push notifications. Use a development build on a real device.",
      };
    }

    const device = await registerDevice({
      expo_push_token: token,
      platform: Platform.OS as DevicePlatform,
      name: (Constants.deviceName ?? "").slice(0, 100),
    });
    await setPushDeviceId(device.id);
    return { state: "enabled" };
  } catch (error) {
    return { state: "error", message: extractErrorMessage(error) };
  }
}

/** Removes this device from the backend. Called on logout and when the user turns push off. */
export async function unregisterCurrentDevice(): Promise<void> {
  const deviceId = await getPushDeviceId();
  if (deviceId === null) return;
  try {
    await deleteDevice(deviceId);
  } catch (error) {
    // Already gone (e.g. taken over by another account on this phone) is fine.
    if (!(axios.isAxiosError(error) && error.response?.status === 404)) throw error;
  }
  await setPushDeviceId(null);
}

export async function enablePush(): Promise<PushStatus> {
  await setPushOptOut(false);
  return syncPushRegistration({ askPermission: true });
}

/** Throws if the backend can't be told — the device would otherwise keep receiving pushes. */
export async function disablePush(): Promise<void> {
  await unregisterCurrentDevice();
  await setPushOptOut(true);
}
