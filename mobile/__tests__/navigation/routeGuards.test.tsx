import { Text } from "react-native";
import { Stack } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import RootLayout from "../../app/_layout";
import Index from "../../app/index";
import AuthLayout from "../../app/(auth)/_layout";
import { LoginScreen } from "../../screens/LoginScreen";
import type { AuthStatus, SignOutReason } from "../../hooks/useAuth";

// The real root layout and index route; auth state is driven by the test.
// Assertions check what is rendered rather than `toHavePathname`: expo-router's
// testing helpers still assume a synchronous RNTL render (RNTL 14 is async).
let mockAuthState: { status: AuthStatus; signOutReason: SignOutReason | null } = {
  status: "signedOut",
  signOutReason: null,
};

jest.mock("../../hooks/useAuth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    ...mockAuthState,
    user: null,
    isAuthenticated: mockAuthState.status === "signedIn",
    login: jest.fn(),
    logout: jest.fn(),
    retry: jest.fn(),
  }),
}));
jest.mock("../../hooks/useOffline", () => ({
  OfflineProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const StackLayout = () => <Stack screenOptions={{ headerShown: false }} />;
const stub = (label: string) => () => <Text>{label}</Text>;

function renderApp(initialUrl: string) {
  return renderRouter(
    {
      _layout: RootLayout,
      index: Index,
      "(auth)/_layout": AuthLayout,
      "(auth)/login": LoginScreen,
      "(auth)/register": stub("Register screen"),
      "(app)/_layout": StackLayout,
      "(app)/dashboard": stub("Dashboard screen"),
      "(app)/transactions": stub("Transactions screen"),
      "(lock)/_layout": StackLayout,
      "(lock)/unlock": stub("Unlock screen"),
    },
    { initialUrl }
  );
}

describe("navigation guards", () => {
  it("signed out: a deep link to a protected screen lands on login", async () => {
    mockAuthState = { status: "signedOut", signOutReason: null };
    await renderApp("/transactions");

    // Heading and button both say "Log in"; the email field proves it's the login form.
    expect(await screen.findByText("Email")).toBeTruthy();
    expect(screen.getAllByText("Log in").length).toBeGreaterThan(0);
    expect(screen.queryByText("Transactions screen")).toBeNull();
  });

  it("signed in: the app opens on the dashboard", async () => {
    mockAuthState = { status: "signedIn", signOutReason: null };
    await renderApp("/");

    expect(await screen.findByText("Dashboard screen")).toBeTruthy();
  });

  it("signed in: login is not reachable", async () => {
    mockAuthState = { status: "signedIn", signOutReason: null };
    await renderApp("/login");

    expect(await screen.findByText("Dashboard screen")).toBeTruthy();
  });

  it("locked: only the unlock screen, even for a deep link", async () => {
    mockAuthState = { status: "locked", signOutReason: null };
    await renderApp("/transactions");

    expect(await screen.findByText("Unlock screen")).toBeTruthy();
    expect(screen.queryByText("Transactions screen")).toBeNull();
  });

  it("session check in progress: nothing but the loading screen", async () => {
    mockAuthState = { status: "loading", signOutReason: null };
    await renderApp("/dashboard");

    expect(await screen.findByText("Checking your session…")).toBeTruthy();
    expect(screen.queryByText("Dashboard screen")).toBeNull();
  });

  it("backend unreachable with a stored session: retry screen, not the login", async () => {
    mockAuthState = { status: "unavailable", signOutReason: null };
    await renderApp("/dashboard");

    expect(await screen.findByText("Can't reach WALLEX")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("an expired session explains why the user is on the login screen", async () => {
    mockAuthState = { status: "signedOut", signOutReason: "expired" };
    await renderApp("/dashboard");

    expect(await screen.findByText("Your session has expired. Please sign in again.")).toBeTruthy();
  });
});
