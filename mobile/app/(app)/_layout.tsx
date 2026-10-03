import { useMemo } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { OfflineBanner } from "../../components/OfflineBanner";
import { SyncProvider } from "../../hooks/useSync";
import { useTheme } from "../../theme";
import { useStackScreenOptions } from "../../theme/navigation";

export default function AppLayout() {
  usePushNotifications();
  const { colors } = useTheme();

  // The banner sits above every screen and takes the top safe-area inset
  // itself, so the headers below it must not add that inset a second time.
  const insets = useSafeAreaInsets();
  const insetsBelowBanner = useMemo(() => ({ ...insets, top: 0 }), [insets]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
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
  const screenOptions = useStackScreenOptions();
  // Forms slide up over the screen they were opened from; everything else is pushed.
  const modal = { presentation: "modal" as const };

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add-transaction" options={{ ...modal, title: t("screens.addTransaction") }} />
      <Stack.Screen name="edit-transaction/[id]" options={{ ...modal, title: t("screens.editTransaction") }} />
      <Stack.Screen name="transaction/[id]" options={{ title: t("screens.transactionDetails") }} />
      <Stack.Screen name="analytics" options={{ title: t("analytics.title") }} />
      <Stack.Screen name="assistant" options={{ title: t("screens.assistant") }} />
      <Stack.Screen name="recurring" options={{ title: t("screens.recurring") }} />
      <Stack.Screen name="add-recurring" options={{ ...modal, title: t("screens.addRecurring") }} />
      <Stack.Screen name="edit-recurring/[id]" options={{ ...modal, title: t("screens.editRecurring") }} />
      <Stack.Screen name="scan-receipt" options={{ ...modal, title: t("screens.scanReceipt") }} />
      <Stack.Screen name="account-data" options={{ title: t("screens.accountData") }} />
      <Stack.Screen name="notification-settings" options={{ title: t("screens.notifications") }} />
    </Stack>
  );
}
