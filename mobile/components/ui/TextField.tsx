import { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { fontFamilies, layout, makeStyles, radius, space, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import { Text } from "./Text";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

const useStyles = makeStyles(({ colors }) => ({
  field: { marginBottom: space[4] },
  label: { marginBottom: space[2] },
  input: {
    minHeight: layout.controlHeight,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fontFamilies.regular,
    // 16px keeps iOS (and mobile browsers) from zooming into the field.
    fontSize: 16,
  },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
  inputError: { borderColor: colors.danger },
  message: { flexDirection: "row", alignItems: "center", gap: space[1], marginTop: space[2] },
}));

/** A labelled text input: the label sits above (never as a placeholder), errors say what to fix. */
export function TextField({ label, error, hint, style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text variant="label" color="textSecondary" style={styles.label}>
        {label}
      </Text>
      <TextInput
        style={[styles.input, isFocused && styles.inputFocused, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.primary}
        autoCapitalize="none"
        accessibilityLabel={label}
        maxFontSizeMultiplier={1.5}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        {...rest}
      />
      {hint && !error ? (
        <Text variant="caption" color="textTertiary" style={{ marginTop: space[2] }}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <View style={styles.message} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={15} color={colors.danger} />
          <Text variant="caption" color="danger" style={{ flexShrink: 1 }}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
