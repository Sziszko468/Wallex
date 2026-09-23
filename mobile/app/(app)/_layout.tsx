import { Stack } from "expo-router";
import { colors } from "../../utils/theme";

export default function AppLayout() {
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
    </Stack>
  );
}
