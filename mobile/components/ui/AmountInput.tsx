import { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { fontFamilies, makeStyles, radius, space, useTheme } from "../../theme";
import type { CurrencyCode } from "../../types/currency";
import { currencySymbol } from "../../utils/format";
import { Icon } from "../icons/Icon";
import { Text } from "./Text";

interface AmountInputProps extends Omit<TextInputProps, "style"> {
  /** "Amount (EUR)" — the accessible name of the field. */
  label: string;
  currency: CurrencyCode;
  error?: string;
}

const GLYPH_COLUMN = 44;
const AMOUNT_FONT_SIZE = 44;

const useStyles = makeStyles(({ colors }) => ({
  wrap: { marginBottom: space[4] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[2],
    borderRadius: radius.lg,
  },
  symbol: { width: GLYPH_COLUMN, textAlign: "center" },
  input: {
    flex: 1,
    // Without this, a web browser sizes the field by its default 20 characters and overflows the row.
    minWidth: 0,
    minHeight: 72,
    paddingVertical: 0,
    textAlign: "center",
    color: colors.text,
    fontFamily: fontFamilies.bold,
    fontSize: AMOUNT_FONT_SIZE,
    letterSpacing: -0.9,
    fontVariant: ["tabular-nums"],
  },
  underline: { height: 2, borderRadius: 1, backgroundColor: colors.border },
  underlineFocused: { backgroundColor: colors.primary },
  underlineError: { backgroundColor: colors.danger },
  message: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[1], marginTop: space[2] },
}));

/**
 * The focus of adding a transaction: one big number, centred, with the currency's sign beside it.
 * Opens the decimal number pad. (The sign is decorative — the label already names the currency.)
 */
export function AmountInput({ label, currency, error, onFocus, onBlur, ...rest }: AmountInputProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text variant="amountLarge" color="textTertiary" style={styles.symbol} importantForAccessibility="no" accessibilityElementsHidden>
          {currencySymbol(currency)}
        </Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          maxFontSizeMultiplier={1.15}
          accessibilityLabel={label}
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
        <View style={{ width: GLYPH_COLUMN }} />
      </View>
      <View style={[styles.underline, isFocused && styles.underlineFocused, error ? styles.underlineError : null]} />
      {error ? (
        <View style={styles.message} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={15} color={colors.danger} />
          <Text variant="caption" color="danger">
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
