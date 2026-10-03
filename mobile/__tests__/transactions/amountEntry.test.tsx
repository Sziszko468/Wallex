/**
 * A Hungarian number pad types a decimal comma: "1 250,50" must reach the API as "1250.50", not
 * be refused as "not a number" and not be sent as typed.
 */
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { RecurringTransactionFormScreen } from "../../screens/RecurringTransactionFormScreen";
import { TransactionFormScreen } from "../../screens/TransactionFormScreen";
import { getRecurringTransaction, updateRecurringTransaction } from "../../services/recurringTransactionsService";
import { getTransaction, updateTransaction } from "../../services/transactionsService";
import type { Transaction } from "../../types/transaction";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: "7" }),
}));
jest.mock("../../services/transactionsService", () => ({ getTransaction: jest.fn(), updateTransaction: jest.fn() }));
jest.mock("../../services/recurringTransactionsService", () => ({
  getRecurringTransaction: jest.fn(),
  updateRecurringTransaction: jest.fn(),
}));
jest.mock("../../services/categoriesService", () => ({
  listCategories: jest.fn(async () => [
    { id: 10, name: "Food", type: "expense", color: "#16a34a", icon: "", is_system: true, created_at: "", updated_at: "" },
  ]),
}));
jest.mock("../../hooks/useCreateTransaction", () => ({
  useCreateTransaction: () => ({ create: jest.fn(), isOffline: false }),
}));
jest.mock("../../hooks/useBaseCurrency", () => ({ useBaseCurrency: () => "EUR" }));

const loaded: Transaction = {
  id: 7,
  amount: "12.50",
  currency: "EUR",
  exchange_rate: "1.0000000000",
  base_amount: "12.50",
  type: "expense",
  category: 10,
  description: "Groceries",
  date: "2026-09-20",
  client_id: null,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

beforeEach(() => {
  (getTransaction as jest.Mock).mockReset().mockResolvedValue(loaded);
  (updateTransaction as jest.Mock).mockReset().mockResolvedValue(loaded);
});

describe("amount typed with a decimal comma", () => {
  it.each([
    ["1250,50", "1250.50"],
    ["1 250,50", "1250.50"],
    ["45,9", "45.9"],
  ])("the transaction form sends %j as %j", async (typed, sent) => {
    const user = userEvent.setup();
    await render(<TransactionFormScreen />);
    const amount = await screen.findByLabelText("Amount (EUR)");
    await user.clear(amount);
    await user.type(amount, typed);

    await user.press(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(updateTransaction).toHaveBeenCalledWith(7, expect.objectContaining({ amount: sent }), expect.anything()),
    );
    expect(screen.queryByText(/positive|valid/i)).toBeNull();
  });

  it("the transaction form still refuses a mix it cannot read", async () => {
    const user = userEvent.setup();
    await render(<TransactionFormScreen />);
    const amount = await screen.findByLabelText("Amount (EUR)");
    await user.clear(amount);
    await user.type(amount, "1,250.50");

    await user.press(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Amount must be greater than 0.")).toBeTruthy();
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("the recurring form sends the comma amount as a dot amount", async () => {
    (getRecurringTransaction as jest.Mock).mockReset().mockResolvedValue({
      id: 7,
      name: "Rent",
      category: 10,
      type: "expense",
      amount: "900.00",
      currency: "EUR",
      frequency: "monthly",
      start_date: "2026-01-01",
      end_date: null,
      description: "",
      is_active: true,
    });
    (updateRecurringTransaction as jest.Mock).mockReset().mockResolvedValue({});
    const user = userEvent.setup();
    await render(<RecurringTransactionFormScreen />);
    const amount = await screen.findByLabelText("Amount");
    await waitFor(() => expect(amount.props.value).toBe("900.00"));
    await user.clear(amount);
    await user.type(amount, "950,5");

    await user.press(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(updateRecurringTransaction).toHaveBeenCalledWith(7, expect.objectContaining({ amount: "950.5" })),
    );
  });
});
