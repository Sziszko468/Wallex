import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";
import { maxFontScale, textVariants, useTheme, type Palette, type TextVariant } from "../../theme";

export interface TextProps extends NativeTextProps {
  /** One of the type scale's styles (theme/tokens.ts). Defaults to body text. */
  variant?: TextVariant;
  /** A colour from the palette — never a raw hex. Defaults to the primary text colour. */
  color?: keyof Palette;
  align?: "left" | "center" | "right";
  /** Marks the text as a heading for screen readers (the rotor / headings navigation). */
  header?: boolean;
}

/**
 * Every piece of text in the app. It carries the typeface, size, line height and tracking of its
 * variant, takes its colour from the theme, and caps how far the system's text-size setting may
 * enlarge it (see maxFontScale) so large figures and tab labels keep their layouts.
 */
export function Text({ variant = "body", color = "text", align, header = false, style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <NativeText
      accessibilityRole={header ? "header" : undefined}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? maxFontScale[variant]}
      {...rest}
      style={[textVariants[variant], { color: colors[color] }, align ? { textAlign: align } : null, style]}
    />
  );
}
