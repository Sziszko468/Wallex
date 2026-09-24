import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import { LoadingScreen } from "../components/LoadingScreen";
import { SessionUnavailableScreen } from "../screens/SessionUnavailableScreen";

function RootNavigator() {
  const { status } = useAuth();

  if (status === "loading") {
    return <LoadingScreen label="Checking your session…" />;
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
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
