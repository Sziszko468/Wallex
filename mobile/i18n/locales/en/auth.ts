export const auth = {
  fields: {
    email: "Email",
    password: "Password",
    firstName: "First name",
    lastName: "Last name",
    confirmPassword: "Confirm password",
  },
  login: {
    title: "Log in",
    submit: "Log in",
    noAccount: "Don't have an account?",
    registerLink: "Register",
  },
  register: {
    title: "Create your account",
    submit: "Register",
    haveAccount: "Already have an account?",
    loginLink: "Log in",
  },
  mfa: {
    title: "Two-factor authentication",
    subtitle: "Enter the {{digits}}-digit code from your authenticator app, or one of your recovery codes.",
    code: "Authentication code",
    verify: "Verify",
    differentAccount: "Use a different account",
  },
  notices: {
    expired: "Your session has expired. Please sign in again.",
    biometricsUnavailable:
      "Biometric unlock is no longer available on this device, so you were signed out for your security. Please sign in again.",
    storageError: "We couldn't read your saved session. Please sign in again.",
  },
  unlock: {
    heading: "{{appName}} is locked",
    text: "Use {{method}} to continue where you left off.",
    unlockWith: "Unlock with {{method}}",
    signInWithPassword: "Sign in with password",
  },
  unavailable: {
    heading: "Can't reach {{appName}}",
    text: "Check your internet connection and try again. You're still signed in.",
    tryAgain: "Try again",
    signOut: "Sign out",
  },
} as const;
