/** Signing in with two-factor authentication: password first, then the authenticator code. */
import { render, screen, userEvent } from "@testing-library/react-native";
import { LanguageProvider } from "../../hooks/useLanguage";
import { LoginScreen } from "../../screens/LoginScreen";

const mockLogin = jest.fn();
const mockVerifyMfa = jest.fn();

jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native");
  return { Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ login: mockLogin, verifyMfa: mockVerifyMfa, signOutReason: null }),
}));

function httpError(status: number, data: unknown) {
  return Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } });
}

async function submitPassword() {
  const user = userEvent.setup();
  await render(
    <LanguageProvider>
      <LoginScreen />
    </LanguageProvider>
  );
  await user.type(screen.getByLabelText("Email"), "anna@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse battery");
  await user.press(screen.getByRole("button", { name: "Log in" }));
  return user;
}

beforeEach(() => {
  mockLogin.mockReset();
  mockVerifyMfa.mockReset();
});

describe("LoginScreen", () => {
  it("asks for the code when two-factor authentication is on, then verifies it", async () => {
    mockLogin.mockResolvedValue({ status: "mfaRequired", mfaToken: "challenge-1" });
    mockVerifyMfa.mockResolvedValue(undefined);
    const user = await submitPassword();

    await user.type(await screen.findByLabelText("Authentication code"), "492039");
    await user.press(screen.getByRole("button", { name: "Verify" }));

    expect(mockLogin).toHaveBeenCalledWith({ email: "anna@example.com", password: "correct horse battery" });
    expect(mockVerifyMfa).toHaveBeenCalledWith("challenge-1", "492039");
  });

  it("shows the server's message for a wrong code and stays on the code step", async () => {
    mockLogin.mockResolvedValue({ status: "mfaRequired", mfaToken: "challenge-1" });
    mockVerifyMfa.mockRejectedValue(httpError(401, { detail: "That code isn't right.", code: "mfa_code_invalid" }));
    const user = await submitPassword();

    await user.type(await screen.findByLabelText("Authentication code"), "000000");
    await user.press(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("That code isn't right.")).toBeTruthy();
    expect(screen.getByLabelText("Authentication code")).toBeTruthy();
  });

  it("explains a locked account", async () => {
    mockLogin.mockRejectedValue(
      httpError(429, { detail: "Too many failed sign-in attempts. Try again in 12 minutes.", code: "account_locked" })
    );
    await submitPassword();

    expect(await screen.findByText("Too many failed sign-in attempts. Try again in 12 minutes.")).toBeTruthy();
    expect(mockVerifyMfa).not.toHaveBeenCalled();
  });
});
