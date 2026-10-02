import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors } from "../../../utils/theme";

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: t("tabs.dashboard") }} />
      {/* Android: the tab bar would otherwise sit on top of the keyboard, over the question box. */}
      <Tabs.Screen name="assistant" options={{ title: t("tabs.assistant"), tabBarHideOnKeyboard: true }} />
      <Tabs.Screen name="transactions" options={{ title: t("tabs.transactions") }} />
      <Tabs.Screen name="recurring" options={{ title: t("tabs.recurring") }} />
      <Tabs.Screen name="budgets" options={{ title: t("tabs.budgets") }} />
      <Tabs.Screen name="settings" options={{ title: t("tabs.settings") }} />
    </Tabs>
  );
}
