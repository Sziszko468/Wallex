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
      {/* Android: the tab bar would otherwise sit on top of the keyboard, over the question box. */}
      <Tabs.Screen name="assistant" options={{ title: "Assistant", tabBarHideOnKeyboard: true }} />
      <Tabs.Screen name="transactions" options={{ title: "Transactions" }} />
      <Tabs.Screen name="recurring" options={{ title: "Recurring" }} />
      <Tabs.Screen name="budgets" options={{ title: "Budgets" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
