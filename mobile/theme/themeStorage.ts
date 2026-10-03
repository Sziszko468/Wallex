import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

// Not secret and not tied to an account: how this device looks. (The web app keeps its own
// choice per browser the same way, under "wallex-theme".)
const THEME_KEY = "wallex_theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** The choice made on this device earlier, or null (storage unreadable counts as never chosen). */
export async function readStoredThemePreference(): Promise<ThemePreference | null> {
  try {
    const stored = await AsyncStorage.getItem(THEME_KEY);
    return isThemePreference(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function storeThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_KEY, preference);
  } catch {
    // A preference: if it can't be saved, it lasts until the app is closed.
  }
}
