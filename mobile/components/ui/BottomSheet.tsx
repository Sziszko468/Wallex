import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout, makeStyles, motion, radius, space, useReducedMotion, useTheme } from "../../theme";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Pinned below the scrolling content (a primary button). */
  footer?: ReactNode;
}

/** A swipe down by this much, or this fast, dismisses the sheet. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.9;
const MAX_HEIGHT_RATIO = 0.88;
const DRAG_START_DISTANCE = 4;

const useStyles = makeStyles(({ colors, shadows }) => ({
  root: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    alignSelf: "center",
    width: "100%",
    maxWidth: layout.bottomSheetMaxWidth,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surfaceRaised,
    boxShadow: shadows.lg,
  },
  grabArea: { paddingTop: space[2] },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  header: { flexDirection: "row", alignItems: "center", minHeight: layout.minTouch, paddingLeft: space[5], paddingRight: space[2] },
  title: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingBottom: space[2] },
  footer: { paddingHorizontal: space[5], paddingTop: space[2] },
}));

/**
 * A sheet that slides up from the bottom: filters, pick lists, a row's actions. Dismiss it with the
 * close button, a tap on the dimmed area, a swipe down on its top edge, or the system back gesture.
 * It respects the home indicator and, with Reduce Motion on, simply appears.
 */
export function BottomSheet({ visible, onClose, title, children, footer }: BottomSheetProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const isReduced = useReducedMotion();
  const [isMounted, setIsMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(windowHeight)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const useNativeDriver = Platform.OS !== "web";
  const duration = isReduced ? 0 : motion.slow;

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      translateY.setValue(windowHeight);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver }),
        Animated.timing(scrim, { toValue: 1, duration, useNativeDriver }),
      ]).start();
    } else if (isMounted) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: windowHeight, duration: duration * 0.8, easing: Easing.in(Easing.cubic), useNativeDriver }),
        Animated.timing(scrim, { toValue: 0, duration: duration * 0.8, useNativeDriver }),
      ]).start(({ finished }) => {
        if (finished) setIsMounted(false);
      });
    }
    // Only a change of `visible` starts an animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > DRAG_START_DISTANCE,
        onPanResponderMove: (_event, gesture) => {
          if (gesture.dy > 0) translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
            onCloseRef.current();
          } else {
            Animated.spring(translateY, { toValue: 0, useNativeDriver }).start();
          }
        },
      }),
    [translateY, useNativeDriver]
  );

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.close")}
          onPress={onClose}
        >
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: scrim }]} />
        </Pressable>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { maxHeight: windowHeight * MAX_HEIGHT_RATIO, paddingBottom: Math.max(insets.bottom, space[4]), transform: [{ translateY }] },
          ]}
        >
          <View {...pan.panHandlers} style={styles.grabArea}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View style={styles.title}>
                {title ? (
                  <Text variant="heading" header numberOfLines={1}>
                    {title}
                  </Text>
                ) : null}
              </View>
              <IconButton icon="x" accessibilityLabel={t("common.actions.close")} onPress={onClose} iconColor="textSecondary" />
            </View>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}
