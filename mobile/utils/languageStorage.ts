import AsyncStorage from "@react-native-async-storage/async-storage";
import { isLanguage, type Language } from "../i18n/languages";

// Not secret and not tied to an account: the language this device was last set to.
const LANGUAGE_KEY = "wallex_language";

/** The language chosen on this device earlier, or null (storage unreadable counts as never chosen). */
export async function readStoredLanguage(): Promise<Language | null> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function storeLanguage(language: Language): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // A preference: if it can't be saved, it lasts until the app is closed.
  }
}
