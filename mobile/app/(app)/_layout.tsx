import { useMemo } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../utils/theme";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { OfflineBanner } from "../../components/OfflineBanner";
import { SyncProvider } from "../../hooks/useSync";

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
        {/* Signed-in screens only: keeps them in step with the account's other devices. */}
        <SyncProvider>
          <AppStack />
        </SyncProvider>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

function AppStack() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="add-transaction"
        options={{
          presentation: "modal",
          title: t("screens.addTransaction"),
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="edit-transaction/[id]"
        options={{
          presentation: "modal",
          title: t("screens.editTransaction"),
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="transaction/[id]"
        options={{
          title: t("screens.transactionDetails"),
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="add-recurring"
        options={{
          presentation: "modal",
          title: t("screens.addRecurring"),
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="scan-receipt"
        options={{
          presentation: "modal",
          title: t("screens.scanReceipt"),
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="account-data"
        options={{
          title: t("screens.accountData"),
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="notification-settings"
        options={{
          title: t("screens.notifications"),
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="edit-recurring/[id]"
        options={{
          presentation: "modal",
          title: t("screens.editRecurring"),
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
    </Stack>
  );
}
