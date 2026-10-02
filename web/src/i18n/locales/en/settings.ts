export const settings = {
  title: "Settings",
  description: "Your profile, how {{appName}} looks, and how your money is shown.",
  profile: {
    title: "Profile",
    fallbackName: "Your account",
    email: "Email",
    firstName: "First name",
    lastName: "Last name",
    memberSince: "Member since",
  },
  appearance: {
    title: "Appearance",
    hint: "System follows your device's light or dark setting, including when it changes at sunset.",
  },
  language: {
    title: "Language",
    hint: "The language of the app. It is saved to your account, so notifications and the assistant use it too.",
  },
  currency: {
    title: "Currency",
    hint: "Totals, budgets and recurring amounts are shown in your base currency. Every transaction keeps the currency it was paid in.",
    baseCurrency: "Base currency",
    change: "Change base currency",
    changed: "Your base currency is now {{currency}}. Totals, budgets and recurring amounts were converted.",
    confirmTitle: "Switch to {{currency}}?",
    confirmMessage:
      "Totals will be shown in {{to}} instead of {{from}}. Each transaction is converted with the ECB rate of its own date; budgets and recurring amounts are converted at the latest rate. The original amounts of your transactions don't change.",
    confirmLabel: "Switch currency",
  },
  security: {
    title: "Security",
    hint: "Signed-in devices, logging out everywhere, your password, two-factor authentication and recent sign-ins.",
    manage: "Manage security",
  },
  session: {
    title: "Session",
    hint: "Log out of {{appName}} on this device.",
  },
} as const;
