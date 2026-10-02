import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import "../i18n";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import { LanguageProvider } from "../hooks/useLanguage";
import { OfflineProvider } from "../hooks/useOffline";
import { LoadingScreen } from "../components/LoadingScreen";
import { SessionUnavailableScreen } from "../screens/SessionUnavailableScreen";

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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LanguageProvider>
          <OfflineProvider>
            <RootNavigator />
          </OfflineProvider>
        </LanguageProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
