import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** True when the person asked the system to cut motion (Reduce Motion / Remove animations). */
export function useReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isCurrent) setIsReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setIsReduced);
    return () => {
      isCurrent = false;
      subscription.remove();
    };
  }, []);

  return isReduced;
}
