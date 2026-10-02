import { MS_PER_MINUTE } from "./time";

/** Digits in an authenticator app's one-time code. */
export const MFA_CODE_LENGTH = 6;

/** The biometric lock re-locks the app after it spent this long in the background. */
export const LOCK_AFTER_BACKGROUND_MINUTES = 1;
export const LOCK_AFTER_BACKGROUND_MS = LOCK_AFTER_BACKGROUND_MINUTES * MS_PER_MINUTE;
