import { render, screen, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppTabBar } from "../../components/navigation/AppTabBar";
import { i18n } from "../../i18n";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const ROUTES = ["dashboard", "transactions", "budgets", "settings"].map((name) => ({ key: `${name}-key`, name }));
const INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

async function renderBar(activeRoute: string) {
  const navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };
  const state = { index: ROUTES.findIndex((route) => route.name === activeRoute), routes: ROUTES };
  await render(<AppTabBar state={state as never} navigation={navigation as never} descriptors={{} as never} insets={INSETS} />);
  return { navigation };
}

describe("AppTabBar", () => {
  it("has four destinations, named, with the current one selected", async () => {
    await renderBar("transactions");

    expect(screen.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual(["Home", "Transactions", "Budgets", "More"]);
    expect(screen.getByRole("tab", { name: "Transactions" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Home" })).not.toBeSelected();
  });

  it("shows a short name under the budgets icon when the full one is long, and keeps the full name for screen readers", async () => {
    await i18n.changeLanguage("hu");
    await renderBar("dashboard");

    expect(screen.getByRole("tab", { name: "Költségkeretek" })).toBeTruthy();
    expect(screen.getByText("Keretek")).toBeTruthy();
    expect(screen.queryByText("Költségkeretek")).toBeNull();
  });

  it("opens another tab on press, after telling the navigator", async () => {
    const { navigation } = await renderBar("dashboard");

    await userEvent.setup().press(screen.getByRole("tab", { name: "Budgets" }));

    expect(navigation.emit).toHaveBeenCalledWith(expect.objectContaining({ type: "tabPress", target: "budgets-key" }));
    expect(navigation.navigate).toHaveBeenCalledWith("budgets", undefined);
  });

  it("does not navigate again when the current tab is pressed", async () => {
    const { navigation } = await renderBar("dashboard");

    await userEvent.setup().press(screen.getByRole("tab", { name: "Home" }));

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("respects a navigator that cancels the press", async () => {
    const { navigation } = await renderBar("dashboard");
    navigation.emit.mockReturnValueOnce({ defaultPrevented: true });

    await userEvent.setup().press(screen.getByRole("tab", { name: "More" }));

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("has the add button in the middle, one tap from anywhere", async () => {
    await renderBar("budgets");

    await userEvent.setup().press(screen.getByRole("button", { name: "Add transaction" }));

    expect(router.push).toHaveBeenCalledWith("/add-transaction");
  });
});
