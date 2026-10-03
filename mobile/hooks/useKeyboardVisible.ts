import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Whether the on-screen keyboard is open. On iOS the show/hide events fire before the animation
 * ("will"), on Android after it ("did").
 */
export function useKeyboardVisible(): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setIsVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setIsVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return isVisible;
}
