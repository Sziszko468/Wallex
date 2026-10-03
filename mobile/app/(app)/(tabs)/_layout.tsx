import { Tabs } from "expo-router";
import { AppTabBar } from "../../../components/navigation/AppTabBar";
import { useTheme } from "../../../theme";

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="budgets" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
