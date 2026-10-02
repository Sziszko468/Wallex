export const auth = {
  layout: {
    headline: "A calmer way to see where your money goes.",
    subline: "Track spending, stay within your budgets and work towards your goals — without the noise.",
  },
  fields: {
    email: "Email",
    password: "Password",
    firstName: "First name",
    lastName: "Last name",
    confirmPassword: "Confirm password",
  },
  login: {
    title: "Log in",
    subtitle: "Welcome back. Pick up where you left off.",
    submit: "Log in",
    noAccount: "Don't have an account?",
    registerLink: "Register",
  },
  mfa: {
    title: "Two-factor authentication",
    subtitle: "Enter the {{digits}}-digit code from your authenticator app, or one of your recovery codes.",
    code: "Authentication code",
    verify: "Verify",
    differentAccount: "Use a different account",
  },
  register: {
    title: "Create your account",
    subtitle: "It takes a minute, and your data stays yours.",
    submit: "Register",
    haveAccount: "Already have an account?",
    loginLink: "Log in",
  },
  userMenu: {
    accountMenu: "Account menu, {{name}}",
  },
} as const;
