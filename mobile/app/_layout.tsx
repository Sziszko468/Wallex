import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, ThemeProvider as NavigationThemeProvider } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useTranslation } from "react-i18next";
import "../i18n";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import { LanguageProvider } from "../hooks/useLanguage";
import { OfflineProvider } from "../hooks/useOffline";
import { LoadingScreen } from "../components/LoadingScreen";
import { SessionUnavailableScreen } from "../screens/SessionUnavailableScreen";
import { ThemeProvider, useTheme } from "../theme";
import { fontAssets } from "../theme/fonts";
import { createNavigationTheme } from "../theme/navigation";

// Keep the splash screen up until the fonts and the saved theme are ready: the first thing drawn
// is already in the right typeface and the right colours.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { t } = useTranslation();
  const { status } = useAuth();

  if (status === "loading") {
    return <LoadingScreen label={t("common.states.checkingSession")} />;
  }
  if (status === "unavailable") {
    return <SessionUnavailableScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={status === "signedIn"}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={status === "locked"}>
        <Stack.Screen name="(lock)" />
      </Stack.Protected>
      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

/** Everything that needs the theme and the fonts: the status bar, the navigation colours, the providers. */
function AppShell() {
  const { scheme, colors, isReady: isThemeReady } = useTheme();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const isReady = isThemeReady && (fontsLoaded || fontError !== null);

  useEffect(() => {
    // The very back layer (visible when the keyboard resizes the window, or when overscrolling).
    if (Platform.OS !== "web") void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
  }, [colors.bg]);

  useEffect(() => {
    if (isReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [isReady]);

  if (!isReady) return null;

  return (
    <NavigationThemeProvider value={createNavigationTheme(scheme, colors)}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <AuthProvider>
        <LanguageProvider>
          <OfflineProvider>
            <RootNavigator />
          </OfflineProvider>
        </LanguageProvider>
      </AuthProvider>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
