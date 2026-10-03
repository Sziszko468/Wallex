import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";
import { palettes, shadows, type ColorScheme, type Palette, type Shadows } from "./tokens";
import {
  readStoredThemePreference,
  storeThemePreference,
  type ThemePreference,
} from "./themeStorage";

export type { ThemePreference } from "./themeStorage";

export interface Theme {
  /** What is drawn right now: the system's appearance for "system", otherwise the choice itself. */
  scheme: ColorScheme;
  isDark: boolean;
  /** What the user picked: follow the device, or always light, or always dark. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** False until the saved choice has been read — nothing is drawn before, so there is no flash. */
  isReady: boolean;
  colors: Palette;
  shadows: Shadows;
}

function createTheme(
  scheme: ColorScheme,
  preference: ThemePreference,
  setPreference: Theme["setPreference"],
  isReady: boolean
): Theme {
  return { scheme, isDark: scheme === "dark", preference, setPreference, isReady, colors: palettes[scheme], shadows: shadows[scheme] };
}

// Outside a provider (a component rendered on its own, in a test) the app looks light.
const ThemeContext = createContext<Theme>(createTheme("light", "system", () => undefined, true));

/**
 * Owns the app's appearance.
 *
 *  • "system" follows the device and reacts the moment the device switches between light and dark.
 *  • "light" / "dark" are explicit choices that the device's setting never overrides.
 *
 * The choice is kept on the device (AsyncStorage). An explicit choice is also handed to the
 * operating system (Appearance.setColorScheme), so the parts the app doesn't draw itself — the
 * status bar, the keyboard, native alerts — match the app instead of the phone.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void readStoredThemePreference().then((stored) => {
      if (!isCurrent) return;
      if (stored) setPreferenceState(stored);
      setIsReady(true);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    // react-native-web has no override: there the app resolves the choice itself, below.
    if (typeof Appearance.setColorScheme === "function") {
      Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
    }
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void storeThemePreference(next);
  }, []);

  const scheme: ColorScheme = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
  const theme = useMemo(() => createTheme(scheme, preference, setPreference, isReady), [scheme, preference, setPreference, isReady]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
