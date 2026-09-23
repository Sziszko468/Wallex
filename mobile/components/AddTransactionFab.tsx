import { Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { colors } from "../utils/theme";

export function AddTransactionFab() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
      onPress={() => router.push("/add-transaction")}
      hitSlop={8}
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
    >
      <Text style={styles.icon}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.25)",
    elevation: 4,
  },
  pressed: {
    opacity: 0.85,
  },
  icon: {
    fontSize: 30,
    lineHeight: 32,
    color: "#fff",
    fontWeight: "600",
  },
});
