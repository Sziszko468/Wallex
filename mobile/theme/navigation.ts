import { useMemo } from "react";
import { DarkTheme, DefaultTheme } from "expo-router";
import { fontFamilies, type ColorScheme, type Palette } from "./tokens";
import { useTheme } from "./ThemeProvider";

type NavigationTheme = typeof DefaultTheme;

/**
 * The navigation library draws its own backgrounds (behind a screen while it slides in, under the
 * header). Giving it the app's colours keeps a dark screen from flashing white during a transition.
 */
export function createNavigationTheme(scheme: ColorScheme, colors: Palette): NavigationTheme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: scheme === "dark",
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      border: colors.divider,
      notification: colors.danger,
    },
  };
}

/** The look of a native header on a pushed screen: the page colour, no shadow, the app's type. */
export function useStackScreenOptions() {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      headerStyle: { backgroundColor: colors.bg },
      headerShadowVisible: false,
      headerTintColor: colors.primaryInk,
      headerTitleStyle: { fontFamily: fontFamilies.semibold, fontSize: 17, color: colors.text },
      headerBackButtonDisplayMode: "minimal" as const,
      contentStyle: { backgroundColor: colors.bg },
    }),
    [colors]
  );
}
