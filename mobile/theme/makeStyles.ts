import { useMemo } from "react";
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import { useTheme, type Theme } from "./ThemeProvider";

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Styles that depend on the theme. Write the factory once at the top of a file, call the returned
 * hook in the component:
 *
 *   const useStyles = makeStyles(({ colors }) => ({ card: { backgroundColor: colors.surface } }));
 *   function Card() { const styles = useStyles(); … }
 *
 * The StyleSheet is rebuilt only when the theme changes, not on every render.
 */
export function makeStyles<T extends NamedStyles>(factory: (theme: Theme) => T): () => T {
  return function useStyles(): T {
    const theme = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)) as T, [theme]);
  };
}
