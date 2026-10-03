/**
 * The transactions tab: grouped by day, filtered from a bottom sheet, and honest about being
 * empty. The API does the filtering — the screen only has to ask for the right thing.
 */
import { render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { TransactionsScreen } from "../../screens/TransactionsScreen";
import { listCategories } from "../../services/categoriesService";
import { listTransactions } from "../../services/transactionsService";
import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { toIsoDate } from "../../utils/date";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../hooks/useOffline", () => ({
  useOffline: () => ({ pendingTransactions: [], retry: jest.fn(), discard: jest.fn(), syncNow: jest.fn(async () => undefined) }),
  useRefetchOnDataChange: jest.fn(),
}));
jest.mock("../../hooks/useRefetchOnFocus", () => ({ useRefetchOnFocus: jest.fn() }));
jest.mock("../../hooks/useBaseCurrency", () => ({ useBaseCurrency: () => "EUR" }));
jest.mock("../../services/categoriesService", () => ({ listCategories: jest.fn() }));
jest.mock("../../services/transactionsService", () => ({ listTransactions: jest.fn() }));

const mockedList = listTransactions as jest.MockedFunction<typeof listTransactions>;
const mockedCategories = listCategories as jest.MockedFunction<typeof listCategories>;

const category = (id: number, name: string, type: "expense" | "income", color: string): Category => ({
  id,
  name,
  type,
  color,
  icon: "",
  is_system: true,
  created_at: "",
  updated_at: "",
});
const CATEGORIES = [category(10, "Food", "expense", "#10b981"), category(11, "Transport", "expense", "#3b82f6"), category(12, "Salary", "income", "#22c55e")];

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toIsoDate(date);
}

function transaction(id: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    amount: "12.50",
    currency: "EUR",
    exchange_rate: "1.0000000000",
    base_amount: "12.50",
    type: "expense",
    category: 10,
    description: `Item ${id}`,
    date: daysAgo(0),
    client_id: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function page(results: Transaction[]) {
  return { count: results.length, next: null, previous: null, results };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCategories.mockResolvedValue(CATEGORIES);
  mockedList.mockResolvedValue(page([transaction(1, { description: "Lunch" }), transaction(2, { description: "Bus", category: 11, date: daysAgo(1) }), transaction(3, { description: "Coffee", date: daysAgo(1) })]));
});

describe("TransactionsScreen", () => {
  it("groups the list by day, newest first, with a heading for each day", async () => {
    await render(<TransactionsScreen />);

    expect(await screen.findByText("Today")).toBeTruthy();
    expect(screen.getByText("Yesterday")).toBeTruthy();
    expect(screen.getByText("Lunch")).toBeTruthy();
    expect(screen.getByText("Bus")).toBeTruthy();
    expect(screen.getByText("Coffee")).toBeTruthy();
  });

  it("writes an expense with a minus and an income with a plus", async () => {
    mockedList.mockResolvedValue(page([transaction(1, { description: "Rent", amount: "850.00" }), transaction(2, { description: "Pay", amount: "3000.00", type: "income", category: 12 })]));
    await render(<TransactionsScreen />);

    expect(await screen.findByText(/^−€850\.00/)).toBeTruthy();
    expect(screen.getByText(/^\+€3,000\.00/)).toBeTruthy();
  });

  it("opens a transaction's details when it is tapped", async () => {
    await render(<TransactionsScreen />);

    await userEvent.setup().press(await screen.findByRole("button", { name: /^Lunch, Food/ }));

    expect(router.push).toHaveBeenCalledWith("/transaction/1");
  });

  it("filters by type from the filters sheet, shows the active filter, and removes it again", async () => {
    const user = userEvent.setup();
    await render(<TransactionsScreen />);
    await screen.findByText("Lunch");
    expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ type: undefined, ordering: "-date" }));

    await user.press(screen.getByRole("button", { name: "Filters" }));
    const sheet = await screen.findByText("Type");
    expect(sheet).toBeTruthy();
    await user.press(screen.getByRole("radio", { name: "Expense" }));
    await user.press(screen.getAllByRole("button", { name: "Done" })[0] as never);

    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ type: "expense" })));
    // The filters button now carries a count, and a chip names the filter.
    expect(screen.getByRole("button", { name: "Filters" })).toHaveProp("accessibilityValue", { text: "1" });
    await user.press(await screen.findByRole("button", { name: "Remove filter Expense" }));

    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ type: undefined })));
    expect(screen.queryByRole("button", { name: "Remove filter Expense" })).toBeNull();
  });

  it("filters by category and date range together", async () => {
    const user = userEvent.setup();
    await render(<TransactionsScreen />);
    await screen.findByText("Lunch");

    await user.press(screen.getByRole("button", { name: "Filters" }));
    const dialogChips = await screen.findAllByRole("button", { name: "Transport" });
    await user.press(dialogChips[0] as never);
    await user.press(screen.getByRole("button", { name: "This month" }));

    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 11, date_from: expect.stringMatching(/^\d{4}-\d{2}-01$/), date_to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
      )
    );
    expect(screen.getByRole("button", { name: "Filters" })).toHaveProp("accessibilityValue", { text: "2" });
  });

  it("searches from the header and asks the API for the text", async () => {
    const user = userEvent.setup();
    await render(<TransactionsScreen />);
    await screen.findByText("Lunch");

    await user.press(screen.getByRole("button", { name: "Search" }));
    await user.type(screen.getByLabelText("Search transactions"), "bus");

    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ search: "bus" })), { timeout: 3000 });
  });

  it("invites you to add your first transaction when there is none at all", async () => {
    mockedList.mockResolvedValue(page([]));
    await render(<TransactionsScreen />);

    expect(await screen.findByText("No transactions yet")).toBeTruthy();
    await userEvent.setup().press(screen.getByRole("button", { name: "Add transaction" }));

    expect(router.push).toHaveBeenCalledWith("/add-transaction");
  });

  it("says nothing matches — and offers to clear — when filters leave an empty list", async () => {
    const user = userEvent.setup();
    await render(<TransactionsScreen />);
    await screen.findByText("Lunch");
    mockedList.mockResolvedValue(page([]));

    await user.press(screen.getByRole("button", { name: "Filters" }));
    await user.press(await screen.findByRole("radio", { name: "Income" }));
    await user.press(screen.getAllByRole("button", { name: "Done" })[0] as never);

    expect(await screen.findByText("Nothing matches")).toBeTruthy();
    mockedList.mockResolvedValue(page([transaction(1, { description: "Lunch" })]));
    await user.press(screen.getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByText("Lunch")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "Filters" })).queryByText("1")).toBeNull();
  });

  it("explains a failure and offers a retry", async () => {
    mockedList.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { isAxiosError: true }));
    await render(<TransactionsScreen />);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
    await userEvent.setup().press(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Lunch")).toBeTruthy();
  });
});
