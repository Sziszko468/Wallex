/**
 * Your data on the phone: share a copy of everything stored about you, or erase the account
 * (a store requirement). Erasing needs the password, and a code too with two-factor on.
 */
import { Share } from "react-native";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { LanguageProvider } from "../../hooks/useLanguage";
import { AccountDataScreen } from "../../screens/AccountDataScreen";
import { exportMyData, getMfaEnabled } from "../../services/authService";

const mockDeleteAccount = jest.fn();

jest.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ deleteAccount: mockDeleteAccount }) }));
jest.mock("../../services/authService", () => ({ exportMyData: jest.fn(), getMfaEnabled: jest.fn() }));

const mockedExport = exportMyData as jest.MockedFunction<typeof exportMyData>;
const mockedMfa = getMfaEnabled as jest.MockedFunction<typeof getMfaEnabled>;

function httpError(status: number, data: unknown) {
  return Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } });
}

async function open() {
  const user = userEvent.setup();
  await render(
    <LanguageProvider>
      <AccountDataScreen />
    </LanguageProvider>,
  );
  return user;
}

beforeEach(() => {
  mockDeleteAccount.mockReset();
  mockedExport.mockReset();
  mockedMfa.mockReset().mockResolvedValue(false);
  jest.spyOn(Share, "share").mockClear().mockResolvedValue({ action: "sharedAction" });
});

describe("AccountDataScreen", () => {
  it("shares the file after asking for the password", async () => {
    mockedExport.mockResolvedValue({ filename: "wallex-export-2026-10-03.json", text: '{"transactions": []}' });
    const user = await open();

    await user.press(screen.getByRole("button", { name: "Download my data" }));
    await user.type(screen.getByLabelText("Password"), "my password");
    await user.press(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(mockedExport).toHaveBeenCalledWith("my password"));
    expect(Share.share).toHaveBeenCalledWith({ title: "wallex-export-2026-10-03.json", message: '{"transactions": []}' });
    expect(await screen.findByRole("button", { name: "Delete my account" })).toBeTruthy(); // back to the start
  });

  it("shows a wrong password and shares nothing", async () => {
    mockedExport.mockRejectedValue(httpError(400, { password: ["Wrong password."] }));
    const user = await open();

    await user.press(screen.getByRole("button", { name: "Download my data" }));
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.press(screen.getByRole("button", { name: "Download" }));

    expect(await screen.findByText("Wrong password.")).toBeTruthy();
    expect(Share.share).not.toHaveBeenCalled();
  });

  it("erases the account with the password", async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    const user = await open();

    await user.press(screen.getByRole("button", { name: "Delete my account" }));
    expect(screen.getByText(/can't be undone/)).toBeTruthy();
    expect(screen.queryByLabelText("Authenticator or recovery code")).toBeNull();
    await user.type(screen.getByLabelText("Password"), "my password");
    await user.press(screen.getByRole("button", { name: "Delete my account forever" }));

    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledWith({ password: "my password", code: undefined }));
  });

  it("asks for a code too when two-factor authentication is on", async () => {
    mockedMfa.mockResolvedValue(true);
    mockDeleteAccount.mockResolvedValue(undefined);
    const user = await open();

    await user.press(screen.getByRole("button", { name: "Delete my account" }));
    await user.type(screen.getByLabelText("Password"), "my password");
    await user.type(await screen.findByLabelText("Authenticator or recovery code"), "k3m9-q2xa");
    await user.press(screen.getByRole("button", { name: "Delete my account forever" }));

    await waitFor(() =>
      expect(mockDeleteAccount).toHaveBeenCalledWith({ password: "my password", code: "k3m9-q2xa" }),
    );
  });

  it("keeps the account and says why when the server refuses", async () => {
    mockDeleteAccount.mockRejectedValue(httpError(400, { password: ["Wrong password."] }));
    const user = await open();

    await user.press(screen.getByRole("button", { name: "Delete my account" }));
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.press(screen.getByRole("button", { name: "Delete my account forever" }));

    expect(await screen.findByText("Wrong password.")).toBeTruthy();
  });

  it("changes nothing when cancelled", async () => {
    const user = await open();

    await user.press(screen.getByRole("button", { name: "Delete my account" }));
    await user.press(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Download my data" })).toBeTruthy();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });
});
