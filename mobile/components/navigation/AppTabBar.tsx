import { Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useTranslation } from "react-i18next";
import { useKeyboardVisible } from "../../hooks/useKeyboardVisible";
import { layout, makeStyles, radius, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Text } from "../ui/Text";

interface TabItem {
  route: string;
  icon: IconName;
  labelKey: "tabs.dashboard" | "tabs.transactions" | "tabs.budgets" | "tabs.more";
  /** The text shown under the icon, when the full name is too long for a fifth of the screen. */
  shortLabelKey?: "tabs.budgetsShort";
}

/** Left of the add button, then right of it. The four places a person goes every day. */
const LEFT_TABS: readonly TabItem[] = [
  { route: "dashboard", icon: "dashboard", labelKey: "tabs.dashboard" },
  { route: "transactions", icon: "transactions", labelKey: "tabs.transactions" },
];
const RIGHT_TABS: readonly TabItem[] = [
  { route: "budgets", icon: "budgets", labelKey: "tabs.budgets", shortLabelKey: "tabs.budgetsShort" },
  { route: "settings", icon: "menu", labelKey: "tabs.more" },
];

const ADD_BUTTON_LIFT = layout.addButtonSize / 2 - 2;
const RING = 6;

const useStyles = makeStyles(({ colors, shadows }) => ({
  bar: { backgroundColor: colors.surfaceRaised, borderTopWidth: 1, borderTopColor: colors.divider },
  row: { flexDirection: "row", height: layout.tabBarHeight, width: "100%", maxWidth: layout.contentMaxWidth, alignSelf: "center" },
  slot: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 2 },
  spacer: { flex: 1 },
  pill: { width: 56, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.full },
  pillActive: { backgroundColor: colors.primarySoft },
  add: {
    pointerEvents: "box-none",
    position: "absolute",
    top: -ADD_BUTTON_LIFT,
    alignSelf: "center",
    width: layout.addButtonSize + RING * 2,
    height: layout.addButtonSize + RING * 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.surfaceRaised,
  },
  addButton: {
    width: layout.addButtonSize,
    height: layout.addButtonSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    boxShadow: shadows.md,
  },
  addPressed: { backgroundColor: colors.primaryPressed },
}));

/**
 * The phone's navigation: four destinations and, between them, the add button — right under the
 * thumb, because adding a transaction is the most frequent thing to do. Everything else (the
 * assistant, recurring payments, settings) is one tap away behind "More".
 */
export function AppTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const isKeyboardOpen = useKeyboardVisible();
  const activeRoute = state.routes[state.index]?.name;

  // On Android the bar would ride up on top of the keyboard, over what is being typed.
  if (isKeyboardOpen && Platform.OS === "android") return null;

  function renderTab(item: TabItem) {
    const route = state.routes.find((candidate) => candidate.name === item.route);
    if (!route) return null;
    const isFocused = activeRoute === item.route;
    const label = t(item.labelKey);
    const visibleLabel = item.shortLabelKey ? t(item.shortLabelKey) : label;

    function handlePress() {
      if (!route) return;
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    }

    return (
      <Pressable
        key={item.route}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: isFocused }}
        onPress={handlePress}
        onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
        android_ripple={{ color: colors.primarySoft, borderless: true }}
        style={styles.slot}
      >
        <View style={[styles.pill, isFocused && styles.pillActive]}>
          <Icon name={item.icon} size={22} color={isFocused ? colors.primaryInk : colors.textSecondary} strokeWidth={isFocused ? 2 : 1.75} />
        </View>
        <Text variant="tab" color={isFocused ? "primaryInk" : "textSecondary"} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {visibleLabel}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      <View style={styles.row}>
        {LEFT_TABS.map(renderTab)}
        <View style={styles.spacer} />
        {RIGHT_TABS.map(renderTab)}
      </View>
      <View style={styles.add}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("screens.addTransaction")}
          onPress={() => router.push("/add-transaction")}
          style={({ pressed }) => [styles.addButton, pressed && styles.addPressed]}
        >
          <Icon name="plus" size={28} color={colors.onPrimary} strokeWidth={2.25} />
        </Pressable>
      </View>
    </View>
  );
}
