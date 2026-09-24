import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "../types/auth";

/**
 * Device-local storage for offline data (cached API responses, pending
 * transactions). Every key is namespaced by user id, so one account can never
 * read — or sync — another account's data on a shared phone.
 *
 * AsyncStorage is NOT encrypted: nothing secret (tokens) goes here, only data
 * the signed-in user can already see in the app. It is cleared on logout.
 */

const PREFIX = "spendly_offline";
const LAST_USER_KEY = `${PREFIX}:last_user`;

let currentUserId: number | null = null;

export function setOfflineUser(userId: number | null): void {
  currentUserId = userId;
}

export function getOfflineUser(): number | null {
  return currentUserId;
}

function userPrefix(userId: number): string {
  return `${PREFIX}:u${userId}:`;
}

export async function readUserJson<T>(name: string): Promise<T | null> {
  if (currentUserId === null) return null;
  const raw = await AsyncStorage.getItem(userPrefix(currentUserId) + name);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null; // corrupted entry — treat as missing
  }
}

export async function writeUserJson(name: string, value: unknown): Promise<void> {
  if (currentUserId === null) throw new Error("No signed-in user for offline storage");
  await AsyncStorage.setItem(userPrefix(currentUserId) + name, JSON.stringify(value));
}

export async function removeUserKeys(names: string[]): Promise<void> {
  if (currentUserId === null || names.length === 0) return;
  const prefix = userPrefix(currentUserId);
  await AsyncStorage.multiRemove(names.map((name) => prefix + name));
}

async function removeKeysWhere(predicate: (key: string) => boolean): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const matching = keys.filter(predicate);
  if (matching.length > 0) await AsyncStorage.multiRemove(matching);
}

export function clearUserData(userId: number): Promise<void> {
  return removeKeysWhere((key) => key.startsWith(userPrefix(userId)));
}

/** Leftovers of other accounts that used this phone before. */
export function clearOtherUsersData(userId: number): Promise<void> {
  const own = userPrefix(userId);
  return removeKeysWhere((key) => key.startsWith(`${PREFIX}:u`) && !key.startsWith(own));
}

/** The profile shown when the app starts without a connection. */
export async function rememberLastUser(user: User): Promise<void> {
  await AsyncStorage.setItem(LAST_USER_KEY, JSON.stringify(user));
}

export async function getLastUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(LAST_USER_KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function forgetLastUser(): Promise<void> {
  await AsyncStorage.removeItem(LAST_USER_KEY);
}
