/**
 * Editing on the phone a transaction the web changed meanwhile: the phone's save is refused
 * (412, nothing overwritten) and the form shows the web's version instead.
 */
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { TransactionFormScreen } from "../../screens/TransactionFormScreen";
import { getTransaction, updateTransaction } from "../../services/transactionsService";
import type { Transaction } from "../../types/transaction";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => ({ id: "7" }),
}));
jest.mock("../../services/transactionsService", () => ({ getTransaction: jest.fn(), updateTransaction: jest.fn() }));
jest.mock("../../services/categoriesService", () => ({
  listCategories: jest.fn(async () => [
    { id: 10, name: "Food", type: "expense", color: "#16a34a", icon: "", is_system: true, created_at: "", updated_at: "" },
  ]),
}));
jest.mock("../../hooks/useCreateTransaction", () => ({
  useCreateTransaction: () => ({ create: jest.fn(), isOffline: false }),
}));
jest.mock("../../hooks/useBaseCurrency", () => ({ useBaseCurrency: () => "EUR" }));

const mockedGet = getTransaction as jest.MockedFunction<typeof getTransaction>;
const mockedUpdate = updateTransaction as jest.MockedFunction<typeof updateTransaction>;

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
const fromWeb: Transaction = { ...loaded, amount: "99.00", description: "Groceries (web)", updated_at: "2026-09-27T10:05:00Z" };

function httpError(status: number, data: unknown) {
  return Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } });
}

beforeEach(() => {
  mockBack.mockClear();
  mockedGet.mockReset().mockResolvedValue(loaded);
  mockedUpdate.mockReset();
});

describe("TransactionFormScreen — edited on another device meanwhile", () => {
  it("sends the loaded version, and on a conflict shows the other device's version", async () => {
    mockedUpdate
      .mockRejectedValueOnce(httpError(412, { detail: "changed", current: fromWeb }))
      .mockResolvedValueOnce(fromWeb);
    const user = userEvent.setup();
    await render(<TransactionFormScreen />);
    const amount = await screen.findByLabelText("Amount (EUR)");
    await user.clear(amount);
    await user.type(amount, "15");

    await user.press(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/just changed on another device/)).toBeTruthy();
    expect(mockedUpdate).toHaveBeenCalledWith(7, expect.objectContaining({ amount: "15" }), "2026-09-27T10:00:00Z");
    expect(screen.getByLabelText("Amount (EUR)").props.value).toBe("99.00");
    expect(screen.getByDisplayValue("Groceries (web)")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    // Saving again is based on the version now on the server.
    await user.press(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenLastCalledWith(7, expect.anything(), "2026-09-27T10:05:00Z"));
  });

  it("explains a transaction deleted on another device", async () => {
    mockedUpdate.mockRejectedValueOnce(httpError(404, { detail: "No Transaction matches the given query." }));
    const user = userEvent.setup();
    await render(<TransactionFormScreen />);
    await screen.findByLabelText("Amount (EUR)");

    await user.press(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("This transaction no longer exists — it was deleted on another device.")).toBeTruthy();
  });
});
