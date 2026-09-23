import { Tabs } from "expo-router";
import { colors } from "../../../utils/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="transactions" options={{ title: "Transactions" }} />
      <Tabs.Screen name="budgets" options={{ title: "Budgets" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
