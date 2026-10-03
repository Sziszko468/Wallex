import { useCallback, useRef, useState, type ReactElement, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, type RefreshControlProps, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { layout, makeStyles, space } from "../theme";

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Passed through to the internal ScrollView — only used when `scroll` is true. */
  refreshControl?: ReactElement<RefreshControlProps>;
  /**
   * The screen edges the content keeps clear of (notch, home indicator). The tab screens leave the
   * bottom to the tab bar; sign-in style screens add "top".
   */
  edges?: readonly Edge[];
  /** Pinned under the content and lifted above the keyboard: the screen's main action. */
  footer?: ReactNode;
  /** Extra style for the scrolling content (padding changes, centring). */
  contentStyle?: StyleProp<ViewStyle>;
}

const DEFAULT_EDGES: readonly Edge[] = ["left", "right", "bottom"];

const useStyles = makeStyles(({ colors }) => ({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: layout.screenPadding, paddingBottom: space[8] },
  // A fixed frame holds a list that scrolls to the edge of the screen (down to the tab bar) and
  // keeps its own bottom padding, so the frame adds none: otherwise the list is cut off short.
  fixedContent: { paddingBottom: 0 },
  column: { flexGrow: 1, width: "100%", maxWidth: layout.contentMaxWidth, alignSelf: "center" },
  footer: { paddingHorizontal: layout.screenPadding, paddingTop: space[3], paddingBottom: space[3], backgroundColor: colors.bg },
  footerInner: { width: "100%", maxWidth: layout.contentMaxWidth, alignSelf: "center" },
}));

/**
 * The frame every screen sits in: the page colour, the safe areas, a column that stays phone-width
 * on a tablet, keyboard avoidance, and (optionally) a pinned footer for the main action.
 */
export function Screen({ children, scroll = false, refreshControl, edges = DEFAULT_EDGES, footer, contentStyle }: ScreenProps) {
  const styles = useStyles();

  // The keyboard-avoiding view must know how far from the top of the window it starts (a header
  // above it, a banner), or on iOS the footer stops short of the keyboard by exactly that much.
  const frameRef = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const measureFrame = useCallback(() => {
    frameRef.current?.measureInWindow((_x, y) => setKeyboardOffset(y));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      <View ref={frameRef} style={styles.flex} onLayout={measureFrame}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={keyboardOffset}>
          {scroll ? (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={[styles.content, contentStyle]}
              keyboardShouldPersistTaps="handled"
              refreshControl={refreshControl}
            >
              <View style={styles.column}>{children}</View>
            </ScrollView>
          ) : (
            <View style={[styles.content, styles.fixedContent, styles.flex, contentStyle]}>
              <View style={[styles.column, styles.flex]}>{children}</View>
            </View>
          )}
          {footer ? (
            <View style={styles.footer}>
              <View style={styles.footerInner}>{footer}</View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
