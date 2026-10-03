import { ActivityIndicator, Pressable, View, type PressableProps } from "react-native";
import { layout, makeStyles, radius, space, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerSoft" | "success";

interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  title: string;
  variant?: ButtonVariant;
  size?: "medium" | "large";
  isLoading?: boolean;
  /** A glyph before the label. */
  icon?: IconName;
}

const useStyles = makeStyles(({ colors }) => ({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    minHeight: layout.buttonHeight,
    paddingHorizontal: space[5],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    overflow: "hidden",
  },
  large: { minHeight: layout.buttonHeightLarge },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  secondaryPressed: { backgroundColor: colors.bgSubtle },
  ghost: { backgroundColor: "transparent" },
  ghostPressed: { backgroundColor: colors.primarySoft },
  danger: { backgroundColor: colors.danger },
  dangerPressed: { backgroundColor: colors.dangerPressed },
  dangerSoft: { backgroundColor: colors.dangerSoft },
  dangerSoftPressed: { backgroundColor: colors.dangerSoft, opacity: 0.8 },
  success: { backgroundColor: colors.success },
  successPressed: { backgroundColor: colors.success, opacity: 0.88 },
  disabled: { opacity: 0.5 },
}));

type StyleKey = keyof ReturnType<typeof useStyles>;

const LABEL_COLOR = {
  primary: "onPrimary",
  secondary: "text",
  ghost: "primaryInk",
  danger: "onDanger",
  dangerSoft: "danger",
  success: "onPrimary",
} as const;

/** The primary action is sage and solid; everything else steps back (secondary, ghost). */
export function Button({
  title,
  variant = "primary",
  size = "medium",
  isLoading = false,
  icon,
  disabled,
  accessibilityState,
  ...rest
}: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isDisabled = Boolean(disabled ?? isLoading);
  const labelColor = LABEL_COLOR[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, busy: isLoading }}
      disabled={isDisabled}
      android_ripple={{ color: colors.overlay, foreground: true }}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        size === "large" && styles.large,
        pressed && !isDisabled && styles[`${variant}Pressed` as StyleKey],
        isDisabled && !isLoading && styles.disabled,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={colors[labelColor]} />
      ) : (
        <>
          {icon && (
            <View importantForAccessibility="no-hide-descendants">
              <Icon name={icon} size={20} color={colors[labelColor]} />
            </View>
          )}
          <Text variant="button" color={labelColor} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
