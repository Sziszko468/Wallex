import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { t } from "i18next";
import { APP_NAME } from "../config/app";
import { AppError } from "./appError";

// Only the refresh token is persisted. The short-lived access token lives in
// memory (services/session.ts), so a copy of the storage never holds a token
// that is directly usable against the API.
const REFRESH_KEY = "wallex_refresh_token";
const BIOMETRIC_LOCK_KEY = "wallex_biometric_lock";
// Push registration of this installation (see services/pushNotifications.ts).
const PUSH_DEVICE_ID_KEY = "wallex_push_device_id";
const PUSH_OPT_OUT_KEY = "wallex_push_opt_out";
// Keys written by builds from before the app was renamed (and the access token, which early
// builds persisted too). Removed on sight so no old token stays in the keychain.
const LEGACY_KEYS = [
  "spendly_access_token",
  "spendly_refresh_token",
  "spendly_biometric_lock",
  "spendly_push_device_id",
  "spendly_push_opt_out",
];

// Keychain (iOS) / Keystore-encrypted (Android) storage, readable only while
// the device is unlocked, excluded from backups and never migrated to another
// device.
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// expo-secure-store has no web implementation. The web target exists only for
// quick previews during development, so it falls back to localStorage there.
const isWeb = Platform.OS === "web";

export class TokenStorageError extends AppError {
  constructor(readonly originalError: unknown) {
    super(t("errors.secureStorage", { appName: APP_NAME }));
  }
}

async function withStorageErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new TokenStorageError(error);
  }
}

function getItem(key: string): Promise<string | null> {
  return withStorageErrors(async () =>
    isWeb ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key, SECURE_OPTIONS)
  );
}

function setItem(key: string, value: string): Promise<void> {
  return withStorageErrors(async () => {
    if (isWeb) {
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
  });
}

function removeItem(key: string): Promise<void> {
  return withStorageErrors(async () => {
    if (isWeb) {
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
  });
}

export function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_KEY);
}

export function setRefreshToken(refresh: string): Promise<void> {
  return setItem(REFRESH_KEY, refresh);
}

export async function getBiometricLockEnabled(): Promise<boolean> {
  return (await getItem(BIOMETRIC_LOCK_KEY)) === "true";
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await setItem(BIOMETRIC_LOCK_KEY, "true");
  } else {
    await removeItem(BIOMETRIC_LOCK_KEY);
  }
}

export async function getPushDeviceId(): Promise<number | null> {
  const value = await getItem(PUSH_DEVICE_ID_KEY);
  return value === null ? null : Number(value);
}

export async function setPushDeviceId(id: number | null): Promise<void> {
  if (id === null) {
    await removeItem(PUSH_DEVICE_ID_KEY);
  } else {
    await setItem(PUSH_DEVICE_ID_KEY, String(id));
  }
}

export async function getPushOptOut(): Promise<boolean> {
  return (await getItem(PUSH_OPT_OUT_KEY)) === "true";
}

export async function setPushOptOut(optedOut: boolean): Promise<void> {
  if (optedOut) {
    await setItem(PUSH_OPT_OUT_KEY, "true");
  } else {
    await removeItem(PUSH_OPT_OUT_KEY);
  }
}

export async function removeLegacyKeys(): Promise<void> {
  await Promise.all(LEGACY_KEYS.map(removeItem));
}

/** Removes everything this device knows about the session, including lock and push settings. */
export async function clearAll(): Promise<void> {
  await Promise.all([
    removeItem(REFRESH_KEY),
    removeItem(BIOMETRIC_LOCK_KEY),
    removeItem(PUSH_DEVICE_ID_KEY),
    removeItem(PUSH_OPT_OUT_KEY),
    ...LEGACY_KEYS.map(removeItem),
  ]);
}
