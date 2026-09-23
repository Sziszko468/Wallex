import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { AuthTokens } from "../types/auth";

const ACCESS_KEY = "spendly_access_token";
const REFRESH_KEY = "spendly_refresh_token";

// expo-secure-store only supports iOS/Android; the web target (used for quick
// preview/testing) falls back to localStorage instead.
const isWeb = Platform.OS === "web";

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return window.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_KEY);
}

export async function setTokens(tokens: AuthTokens): Promise<void> {
  await Promise.all([setItem(ACCESS_KEY, tokens.access), setItem(REFRESH_KEY, tokens.refresh)]);
}

export async function setAccessToken(access: string): Promise<void> {
  await setItem(ACCESS_KEY, access);
}

export async function setRefreshToken(refresh: string): Promise<void> {
  await setItem(REFRESH_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([removeItem(ACCESS_KEY), removeItem(REFRESH_KEY)]);
}
