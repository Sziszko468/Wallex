import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = "Search transactions" }: SearchBarProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
        {"\u{1F50D}"}
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          hitSlop={8}
          style={styles.clearButton}
        >
          <Text style={styles.clearIcon}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  icon: {
    fontSize: fontSize.base,
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  clearButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  clearIcon: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
});
