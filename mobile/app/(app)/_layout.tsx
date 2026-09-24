import { Stack } from "expo-router";
import { colors } from "../../utils/theme";
import { usePushNotifications } from "../../hooks/usePushNotifications";

export default function AppLayout() {
  usePushNotifications();

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
