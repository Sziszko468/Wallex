export const settings = {
  title: "More",
  profile: {
    memberSince: "Member since",
  },
  tools: {
    title: "Tools",
  },
  appearance: {
    title: "Appearance",
    theme: "Theme",
    hint: "System follows your phone's light or dark setting.",
    system: "System",
    light: "Light",
    dark: "Dark",
  },
  about: {
    title: "About",
    version: "Version",
  },
  language: {
    title: "Language",
    hint: "Saved to your account, so notifications and the assistant use it too.",
  },
  currency: {
    title: "Currency",
    base: "Base currency",
    hint: "Totals, budgets and recurring amounts are shown in this currency. You can change it in the {{appName}} web app.",
  },
  notifications: {
    title: "Notifications",
    hint: "Budget alerts, payment reminders and important insights.",
    button: "Notification settings",
  },
  security: {
    title: "Security",
    unlockWith: "Unlock with {{method}}",
    requireHint_one: "Require it to open {{appName}}, and after {{count}} minute in the background.",
    requireHint_other: "Require it to open {{appName}}, and after {{count}} minutes in the background.",
    setupHint: "Set up {{method}} in your device settings to use this.",
  },
  data: {
    title: "Your data",
    hint: "Download everything {{appName}} stores about you, or delete your account for good.",
    button: "Manage my data",
    download: {
      button: "Download my data",
      confirmIdentity: "Confirm it's you to download your data.",
      submit: "Download",
    },
    delete: {
      button: "Delete my account",
      warning:
        "This permanently deletes your account and everything in it: transactions, budgets, goals and history. It can't be undone. Download your data first if you want to keep a copy.",
      confirmIdentity: "Enter your password to confirm.",
      code: "Authenticator or recovery code",
      submit: "Delete my account forever",
    },
  },
  session: {
    title: "Session",
    unsynced_one:
      "{{count}} transaction hasn't been synced yet. Logging out now discards it — connect to the internet first to keep it.",
    unsynced_other:
      "{{count}} transactions haven't been synced yet. Logging out now discards them — connect to the internet first to keep them.",
    logout: "Log out",
    lostPhone: "Lost a phone or signed in somewhere you shouldn't have? End every session at once.",
    logoutAll: "Log out of all devices",
    logoutAllMessage: "Every phone and browser signed in to your account is signed out, this one included.",
    logoutAllConfirm: "Log out everywhere",
  },
  notificationSettings: {
    device: {
      title: "This device",
      unsupportedPlatform: "Push notifications are available in the iOS and Android app.",
      push: "Push notifications",
      pushHint: "Receive {{appName}} alerts on this phone.",
      canAskAgain: "Notifications aren't allowed yet. Turn the switch on to allow them.",
      blocked: "Notifications are turned off for {{appName}} in your device settings.",
      openSettings: "Open device settings",
    },
    preferences: {
      title: "Notify me about",
      subtitle: "Applies to all your devices.",
      remind: "Remind me",
      days_one: "{{count}} day",
      days_other: "{{count}} days",
      daysBefore_one: "{{count}} day before",
      daysBefore_other: "{{count}} days before",
      after: "before a subscription or other recurring payment is due.",
    },
    toggles: {
      budget_warnings: {
        label: "Budget almost used",
        hint: "When a budget reaches {{percent}}%.",
      },
      budget_exceeded: {
        label: "Budget exceeded",
        hint: "When you spend more than a budget.",
      },
      subscription_reminders: {
        label: "Subscription payments",
        hint: "Before a subscription is charged.",
      },
      recurring_reminders: {
        label: "Other recurring payments",
        hint: "Before rent, bills and other recurring expenses are due.",
      },
      savings_goals: {
        label: "Savings goals",
        hint: "Milestones on the way to a goal.",
      },
      unusual_spending: {
        label: "Unusual spending",
        hint: "When a category costs clearly more than usual.",
      },
      monthly_summary: {
        label: "Monthly summary",
        hint: "Last month's spending, early in the month.",
      },
      insights: {
        label: "Important insights",
        hint: "For example when expenses exceed income.",
      },
    },
    push: {
      channelName: "{{appName}} alerts",
      noProject: "Push notifications aren't configured for this build (missing EAS project ID).",
      devBuild: "This build can't receive push notifications. Use a development build on a real device.",
    },
  },
  biometrics: {
    generic: "Biometrics",
    fingerprint: "Fingerprint",
    unlockPrompt: "Unlock {{appName}}",
    enablePrompt: "Enable {{method}} for {{appName}}",
    cancel: "Cancel",
    notSetUp: "{{method}} isn't set up on this device.",
    lockedOut: "Too many failed attempts — {{method}} is temporarily locked. Sign in with your password instead.",
    removed: "{{method}} is no longer set up on this device. Sign in with your password instead.",
    failedVerify: "We couldn't verify it's you. Please try again.",
    timedOut: "The request timed out. Please try again.",
    didntWork: "{{method}} didn't work. Try again, or sign in with your password.",
  },
} as const;
