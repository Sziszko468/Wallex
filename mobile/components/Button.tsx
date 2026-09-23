import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import { colors, fontSize, radius, spacing } from "../utils/theme";

interface ButtonProps extends Omit<PressableProps, "style"> {
  title: string;
  variant?: "primary" | "secondary" | "danger" | "success";
  size?: "medium" | "large";
  isLoading?: boolean;
}

export function Button({
  title,
  variant = "primary",
  size = "medium",
  isLoading = false,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled ?? isLoading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        size === "large" && styles.large,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
      {...rest}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === "secondary" ? colors.text : "#fff"} />
      ) : (
        <Text
          style={[
            styles.text,
            variant === "secondary" && styles.textSecondary,
            size === "large" && styles.textLarge,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md - 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minHeight: 48,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  success: {
    backgroundColor: colors.success,
  },
  large: {
    minHeight: 60,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    color: "#fff",
    fontSize: fontSize.base,
    fontWeight: "600",
  },
  textSecondary: {
    color: colors.text,
  },
  textLarge: {
    fontSize: fontSize.lg,
  },
});
