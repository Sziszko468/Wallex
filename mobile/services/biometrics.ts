import { Platform } from "react-native";
import { t } from "i18next";
import * as LocalAuthentication from "expo-local-authentication";
import { logWarning } from "../utils/logging";

/**
 * Device-local biometric check (Face ID, Touch ID, Android biometrics).
 *
 * This never talks to the backend and never replaces signing in: it only
 * decides whether the app may use the session already stored on this device.
 */

export type BiometricUnavailableReason = "unsupported_platform" | "no_hardware" | "not_enrolled";

export type BiometricCapability =
  | { isAvailable: true; label: string }
  | { isAvailable: false; label: string; reason: BiometricUnavailableReason };

export type BiometricFailureReason = "cancelled" | "lockout" | "unavailable" | "failed";

export type BiometricResult =
  | { success: true }
  | { success: false; reason: BiometricFailureReason; message: string | null };

function describe(types: LocalAuthentication.AuthenticationType[]): string {
  const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  if (Platform.OS === "ios") {
    if (hasFace) return "Face ID";
    if (hasFingerprint) return "Touch ID";
  }
  if (types.length === 1) {
    if (hasFace) return "Face Unlock";
    if (hasFingerprint) return t("settings.biometrics.fingerprint");
  }
  return t("settings.biometrics.generic");
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  if (Platform.OS === "web") {
    return { isAvailable: false, label: t("settings.biometrics.generic"), reason: "unsupported_platform" };
  }

  try {
    const [hasHardware, isEnrolled, types, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    const label = describe(types);

    if (!hasHardware) {
      return { isAvailable: false, label, reason: "no_hardware" };
    }
    // Android's "weak" (class 2) biometrics — e.g. many camera-based face
    // unlocks — are not accepted, matching `biometricsSecurityLevel: "strong"`.
    const isStrongEnough =
      Platform.OS !== "android" || level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
    if (!isEnrolled || !isStrongEnough) {
      return { isAvailable: false, label, reason: "not_enrolled" };
    }
    return { isAvailable: true, label };
  } catch (error) {
    logWarning("Failed to query biometric capability", error);
    return { isAvailable: false, label: t("settings.biometrics.generic"), reason: "no_hardware" };
  }
}

function toFailure(error: LocalAuthentication.LocalAuthenticationError, label: string): BiometricResult {
  switch (error) {
    case "user_cancel":
    case "system_cancel":
    case "app_cancel":
    case "user_fallback":
      // Not an error from the user's point of view — no message, just stay put.
      return { success: false, reason: "cancelled", message: null };
    case "lockout":
      return {
        success: false,
        reason: "lockout",
        message: t("settings.biometrics.lockedOut", { method: label }),
      };
    case "not_enrolled":
    case "not_available":
    case "passcode_not_set":
      return {
        success: false,
        reason: "unavailable",
        message: t("settings.biometrics.removed", { method: label }),
      };
    case "authentication_failed":
      return { success: false, reason: "failed", message: t("settings.biometrics.failedVerify") };
    case "timeout":
      return { success: false, reason: "failed", message: t("settings.biometrics.timedOut") };
    default:
      return {
        success: false,
        reason: "failed",
        message: t("settings.biometrics.didntWork", { method: label }),
      };
  }
}

export async function authenticateWithBiometrics(
  promptMessage: string,
  label: string
): Promise<BiometricResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: t("settings.biometrics.cancel"),
      // No silent fallback to the device passcode: the lock screen offers
      // "Sign in with password" (the backend credential) as the alternative.
      disableDeviceFallback: true,
      biometricsSecurityLevel: "strong",
    });
    return result.success ? { success: true } : toFailure(result.error, label);
  } catch (error) {
    logWarning("Biometric authentication threw", error);
    return toFailure("unknown", label);
  }
}
