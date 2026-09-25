import { useMemo } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../utils/theme";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { OfflineBanner } from "../../components/OfflineBanner";

export default function AppLayout() {
  usePushNotifications();

  // The banner sits above every screen and takes the top safe-area inset
  // itself, so the headers below it must not add that inset a second time.
  const insets = useSafeAreaInsets();
  const insetsBelowBanner = useMemo(() => ({ ...insets, top: 0 }), [insets]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top }}>
        <OfflineBanner />
      </View>
      <SafeAreaInsetsContext.Provider value={insetsBelowBanner}>
        <AppStack />
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

function AppStack() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="add-transaction"
        options={{
          presentation: "modal",
          title: "Add transaction",
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="edit-transaction/[id]"
        options={{
          presentation: "modal",
          title: "Edit transaction",
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="transaction/[id]"
        options={{
          title: "Transaction details",
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="add-recurring"
        options={{
          presentation: "modal",
          title: "Add recurring transaction",
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="scan-receipt"
        options={{
          presentation: "modal",
          title: "Scan receipt",
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="notification-settings"
        options={{
          title: "Notifications",
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="edit-recurring/[id]"
        options={{
          presentation: "modal",
          title: "Edit recurring transaction",
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
    </Stack>
  );
}
