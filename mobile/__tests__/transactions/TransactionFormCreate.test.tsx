/**
 * Adding a transaction, amount first: type the amount, pick a category (a tile), save. Nothing is
 * sent until the form is valid, and what is sent is exactly what is on the screen.
 */
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { TransactionFormScreen } from "../../screens/TransactionFormScreen";
import type { Category } from "../../types/category";
import { toIsoDate } from "../../utils/date";

const mockCreate = jest.fn();
let mockIsOffline = false;
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../hooks/useCreateTransaction", () => ({
  useCreateTransaction: () => ({ create: mockCreate, isOffline: mockIsOffline }),
}));
jest.mock("../../hooks/useBaseCurrency", () => ({ useBaseCurrency: () => "EUR" }));
jest.mock("../../services/categoriesService", () => ({ listCategories: jest.fn() }));

import { listCategories } from "../../services/categoriesService";

const category = (id: number, name: string, type: "expense" | "income"): Category => ({
  id,
  name,
  type,
  color: "#10b981",
  icon: "",
  is_system: true,
  created_at: "",
  updated_at: "",
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIsOffline = false;
  mockCreate.mockResolvedValue({ savedOffline: false });
  (listCategories as jest.Mock).mockResolvedValue([category(10, "Food", "expense"), category(11, "Transport", "expense"), category(12, "Salary", "income")]);
});

describe("TransactionFormScreen — new transaction", () => {
  it("opens on the amount, as an expense, with today's date", async () => {
    await render(<TransactionFormScreen />);

    const amount = await screen.findByLabelText("Amount (EUR)");
    expect(amount).toHaveProp("autoFocus", true);
    expect(screen.getByRole("radio", { name: "Expense" })).toBeChecked();
    expect(screen.getByLabelText("Date")).toHaveProp("value", toIsoDate(new Date()));
  });

  it("offers only the categories of the chosen type, and resets the pick when the type changes", async () => {
    const user = userEvent.setup();
    await render(<TransactionFormScreen />);
    await screen.findByRole("radio", { name: "Food" });
    expect(screen.queryByRole("radio", { name: "Salary" })).toBeNull();

    await user.press(screen.getByRole("radio", { name: "Food" }));
    await user.press(screen.getByRole("radio", { name: "Income" }));

    expect(screen.getByRole("radio", { name: "Salary" })).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: "Food" })).toBeNull();
  });

  it("asks for what is missing, and sends nothing", async () => {
    const user = userEvent.setup();
    await render(<TransactionFormScreen />);
    await screen.findByRole("radio", { name: "Food" });

    await user.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Amount is required.")).toBeTruthy();
    expect(screen.getByText("Choose a category.")).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sends exactly what was entered, then confirms and closes", async () => {
    const user = userEvent.setup();
    await render(<TransactionFormScreen />);
    await user.type(await screen.findByLabelText("Amount (EUR)"), "42,50");
    await user.press(screen.getByRole("radio", { name: "Transport" }));
    await user.type(screen.getByLabelText("Description (optional)"), "Taxi home");

    await user.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        amount: "42.50",
        type: "expense",
        category: 11,
        description: "Taxi home",
        date: toIsoDate(new Date()),
      })
    );
    expect(await screen.findByRole("button", { name: "Saved ✓" })).toBeTruthy();
    await waitFor(() => expect(router.back).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("says plainly that it will be saved offline, and says so on the button", async () => {
    mockIsOffline = true;
    mockCreate.mockResolvedValue({ savedOffline: true });
    await render(<TransactionFormScreen />);

    expect(await screen.findByText(/saved on your phone and syncs/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save offline" })).toBeTruthy();
  });

  it("shows what the server refused, next to the field it is about", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue(Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status: 400, data: { amount: ["Ensure this value is less than 1000000."] } } }));
    await render(<TransactionFormScreen />);
    await user.type(await screen.findByLabelText("Amount (EUR)"), "5000000");
    await user.press(screen.getByRole("radio", { name: "Food" }));

    await user.press(screen.getByRole("button", { name: "Save" }));

    // Both in the banner (so an error about a field the form doesn't show is never lost) and under the amount.
    expect((await screen.findAllByText("Ensure this value is less than 1000000.")).length).toBeGreaterThanOrEqual(2);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("can switch to scanning a receipt instead", async () => {
    await render(<TransactionFormScreen />);

    await userEvent.setup().press(await screen.findByRole("button", { name: "Scan a receipt instead" }));

    expect(router.replace).toHaveBeenCalledWith("/scan-receipt");
  });
});
