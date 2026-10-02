import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { LanguageSelector } from "../../components/LanguageSelector";
import { LanguageProvider } from "../../hooks/useLanguage";
import { i18n } from "../../i18n";
import { LoginScreen } from "../../screens/LoginScreen";
import type { User } from "../../types/auth";

const mockChangeLanguage = jest.fn();
let mockUser: User | null = null;

jest.mock("expo-router", () => {
  const { Text: NativeText } = jest.requireActual("react-native");
  return { Link: ({ children }: { children: React.ReactNode }) => <NativeText>{children}</NativeText> };
});
jest.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    changeLanguage: mockChangeLanguage,
    login: jest.fn(),
    verifyMfa: jest.fn(),
    register: jest.fn(),
    signOutReason: null,
  }),
}));

const anna: User = {
  id: 1,
  email: "anna@example.com",
  first_name: "Anna",
  last_name: "",
  date_joined: "2026-09-01",
  base_currency: "EUR",
  language: "en",
};

async function renderWithProvider(ui: React.ReactElement) {
  await render(<LanguageProvider>{ui}</LanguageProvider>);
}

beforeEach(() => {
  mockUser = null;
  mockChangeLanguage.mockReset();
  mockChangeLanguage.mockResolvedValue(undefined);
});

describe("language switch — signed out", () => {
  it("shows the interface in English by default", async () => {
    await renderWithProvider(<LoginScreen />);

    expect(screen.getByRole("button", { name: "Log in" })).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("switches to Hungarian and remembers the choice", async () => {
    const user = userEvent.setup();
    await renderWithProvider(<LoginScreen />);

    await user.press(screen.getByRole("radio", { name: "Magyar" }));

    expect(await screen.findByLabelText("Jelszó")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bejelentkezés" })).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem("wallex_language")).toBe("hu"));
    expect(i18n.language).toBe("hu");
  });

  it("switches back to English", async () => {
    const user = userEvent.setup();
    await renderWithProvider(<LoginScreen />);

    await user.press(screen.getByRole("radio", { name: "Magyar" }));
    await user.press(screen.getByRole("radio", { name: "English" }));

    expect(await screen.findByLabelText("Password")).toBeTruthy();
    expect(await AsyncStorage.getItem("wallex_language")).toBe("en");
  });

  it("marks the current language as selected", async () => {
    await renderWithProvider(<LanguageSelector />);

    expect(screen.getByRole("radio", { name: "English" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole("radio", { name: "Magyar" }).props.accessibilityState.selected).toBe(false);
  });

  it("names each language in itself", async () => {
    const user = userEvent.setup();
    await renderWithProvider(<LanguageSelector />);
    await user.press(screen.getByRole("radio", { name: "Magyar" }));

    expect(screen.getByLabelText("Nyelv")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "English" })).toBeTruthy();
  });
});

describe("language switch — stored and account language", () => {
  it("restores the language saved on this device", async () => {
    await AsyncStorage.setItem("wallex_language", "hu");

    await renderWithProvider(<LoginScreen />);

    expect(await screen.findByLabelText("Jelszó")).toBeTruthy();
  });

  it("uses the account's language once signed in", async () => {
    mockUser = { ...anna, language: "hu" };

    await renderWithProvider(<LoginScreen />);

    expect(await screen.findByLabelText("Jelszó")).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem("wallex_language")).toBe("hu"));
  });

  it("saves a change to the account", async () => {
    mockUser = anna;
    const user = userEvent.setup();
    await renderWithProvider(<LanguageSelector />);

    await user.press(screen.getByRole("radio", { name: "Magyar" }));

    await waitFor(() => expect(mockChangeLanguage).toHaveBeenCalledWith("hu"));
  });

  it("does not save when the language is already the account's", async () => {
    mockUser = anna;
    const user = userEvent.setup();
    await renderWithProvider(<LanguageSelector />);

    await user.press(screen.getByRole("radio", { name: "English" }));

    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });

  it("keeps the change on this device when saving it fails", async () => {
    mockUser = anna;
    mockChangeLanguage.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    await renderWithProvider(<LanguageSelector />);

    await user.press(screen.getByRole("radio", { name: "Magyar" }));

    await waitFor(() => expect(mockChangeLanguage).toHaveBeenCalled());
    expect(i18n.language).toBe("hu");
    expect(await AsyncStorage.getItem("wallex_language")).toBe("hu");
  });

  it("re-renders text that is already on screen when the language changes elsewhere", async () => {
    function Greeting() {
      const { t } = require("react-i18next").useTranslation();
      return <Text>{t("common.actions.cancel")}</Text>;
    }
    await renderWithProvider(<Greeting />);
    expect(screen.getByText("Cancel")).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage("hu");
    });

    expect(screen.getByText("Mégse")).toBeTruthy();
  });
});
