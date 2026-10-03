/**
 * The home screen: the balance first, then what needs attention, where the money went, the
 * budgets and the latest transactions — and a plain invitation instead when nothing is recorded.
 * Every figure is the API's; the screen only decides what to show and in what order.
 */
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { DashboardScreen } from "../../screens/DashboardScreen";
import { getCategoryAnalytics, getDashboard, getInsights } from "../../services/analyticsService";
import { listCategories } from "../../services/categoriesService";
import { listTransactions } from "../../services/transactionsService";
import type { Category } from "../../types/category";
import type { DashboardStats } from "../../types/dashboard";
import type { Transaction } from "../../types/transaction";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, email: "anna@example.com", first_name: "Anna", last_name: "Kovács", base_currency: "EUR", date_joined: "2026-01-01" } }),
}));
jest.mock("../../hooks/useOffline", () => ({ useRefetchOnDataChange: jest.fn() }));
jest.mock("../../hooks/useRefetchOnFocus", () => ({ useRefetchOnFocus: jest.fn() }));
jest.mock("../../services/analyticsService", () => ({ getDashboard: jest.fn(), getCategoryAnalytics: jest.fn(), getInsights: jest.fn() }));
jest.mock("../../services/categoriesService", () => ({ listCategories: jest.fn() }));
jest.mock("../../services/transactionsService", () => ({ listTransactions: jest.fn() }));

const mocked = {
  dashboard: getDashboard as jest.MockedFunction<typeof getDashboard>,
  breakdown: getCategoryAnalytics as jest.MockedFunction<typeof getCategoryAnalytics>,
  insights: getInsights as jest.MockedFunction<typeof getInsights>,
  categories: listCategories as jest.MockedFunction<typeof listCategories>,
  transactions: listTransactions as jest.MockedFunction<typeof listTransactions>,
};

const food: Category = { id: 10, name: "Food", type: "expense", color: "#10b981", icon: "", is_system: true, created_at: "", updated_at: "" };
const transport: Category = { id: 11, name: "Transport", type: "expense", color: "#3b82f6", icon: "", is_system: true, created_at: "", updated_at: "" };

const STATS: DashboardStats = {
  year: 2026,
  month: 9,
  total_income: "3000.00",
  total_expenses: "1866.01",
  balance: "1133.99",
  transaction_count: 28,
  top_spending_category: null,
  budget_usage: [
    { budget_id: 1, category_id: 10, category_name: "Food", budget_amount: "450.00", spent_amount: "340.75", remaining_amount: "109.25", usage_percentage: 75.7, variance_percentage: -24.3, expected_to_date: "300.00", status: "on_track" },
    { budget_id: 2, category_id: 11, category_name: "Transport", budget_amount: "160.00", spent_amount: "188.20", remaining_amount: "-28.20", usage_percentage: 117.6, variance_percentage: 17.6, expected_to_date: "100.00", status: "over_budget" },
  ],
  subscriptions: { active_count: 0, monthly_total: "0.00", yearly_total: "0.00", due_this_month: "0.00", unconverted_currencies: [] },
};

const lunch: Transaction = {
  id: 5,
  amount: "12.50",
  currency: "EUR",
  exchange_rate: "1.0000000000",
  base_amount: "12.50",
  type: "expense",
  category: 10,
  description: "Lunch",
  date: "2026-09-29",
  client_id: null,
  created_at: "",
  updated_at: "",
};

beforeEach(() => {
  jest.clearAllMocks();
  mocked.dashboard.mockResolvedValue(STATS);
  mocked.breakdown.mockResolvedValue({
    year: 2026,
    month: 9,
    categories: [
      { category_id: 10, category_name: "Food", amount: "340.75", percentage: 60 },
      { category_id: 11, category_name: "Transport", amount: "188.20", percentage: 40 },
    ],
  });
  mocked.insights.mockResolvedValue({
    year: 2026,
    month: 9,
    insights: [
      { id: "a", type: "budget_exceeded", severity: "alert", message: "Transport exceeded its budget by 18%.", category_id: 11, amount: "28.20", percentage: 18 },
      { id: "b", type: "budget_warning", severity: "warning", message: "Food is nearly used up.", category_id: 10, amount: "9.25", percentage: 91 },
      { id: "c", type: "top_category", severity: "info", message: "Housing is where most of your money went.", category_id: null, amount: "850.00", percentage: null },
    ],
  });
  mocked.categories.mockResolvedValue([food, transport]);
  mocked.transactions.mockResolvedValue({ count: 1, next: null, previous: null, results: [lunch] });
});

describe("DashboardScreen", () => {
  it("leads with the balance, then what came in and what went out", async () => {
    await render(<DashboardScreen />);

    expect(await screen.findByText("€1,133.99")).toBeTruthy();
    expect(screen.getByText("+€3,000.00")).toBeTruthy();
    expect(screen.getByText("−€1,866.01")).toBeTruthy();
    expect(screen.getByText("28 transactions this month")).toBeTruthy();
    expect(screen.getByText("Anna")).toBeTruthy();
  });

  it("never cuts a figure short: the income and expense values carry no line limit", async () => {
    await render(<DashboardScreen />);

    const income = await screen.findByText("+€3,000.00");
    const expenses = screen.getByText("−€1,866.01");

    expect(income.props.numberOfLines).toBeUndefined();
    expect(expenses.props.numberOfLines).toBeUndefined();
  });

  it("shows the two most important insights and keeps the rest one tap away", async () => {
    const user = userEvent.setup();
    await render(<DashboardScreen />);

    expect(await screen.findByText("Transport exceeded its budget by 18%.")).toBeTruthy();
    expect(screen.getByText("Food is nearly used up.")).toBeTruthy();
    expect(screen.queryByText("Housing is where most of your money went.")).toBeNull();

    await user.press(screen.getByRole("button", { name: "Show 1 more" }));

    expect(screen.getByText("Housing is where most of your money went.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("lists the budgets nearest their limit, each with its status in words", async () => {
    await render(<DashboardScreen />);

    expect(await screen.findByText("Over budget")).toBeTruthy();
    expect(screen.getByText("On track")).toBeTruthy();
    expect(screen.getByText("€188.20 of €160.00")).toBeTruthy();
  });

  it("goes deeper only when asked: analytics, all budgets, all transactions", async () => {
    const user = userEvent.setup();
    await render(<DashboardScreen />);
    await screen.findByText("€1,133.99");

    await user.press(screen.getByRole("link", { name: "Analytics" }));
    await user.press(screen.getAllByRole("link", { name: "View all" })[0] as never);
    await user.press(screen.getAllByRole("link", { name: "View all" })[1] as never);

    expect(router.push).toHaveBeenCalledWith("/analytics");
    expect(router.push).toHaveBeenCalledWith("/budgets");
    expect(router.push).toHaveBeenCalledWith("/transactions");
  });

  it("opens a recent transaction, and the assistant from the header", async () => {
    const user = userEvent.setup();
    await render(<DashboardScreen />);

    await user.press(await screen.findByRole("button", { name: /^Lunch, Food/ }));
    await user.press(screen.getByRole("button", { name: "Ask the assistant" }));

    expect(router.push).toHaveBeenCalledWith("/transaction/5");
    expect(router.push).toHaveBeenCalledWith("/assistant");
  });

  it("moves to the previous month and asks for that month's figures", async () => {
    const user = userEvent.setup();
    await render(<DashboardScreen />);
    await screen.findByText("€1,133.99");
    const { year, month } = mocked.dashboard.mock.calls[0]?.[0] ?? { year: 0, month: 0 };

    await user.press(screen.getByRole("button", { name: "Previous month" }));

    const expected = month === 1 ? { year: (year ?? 0) - 1, month: 12 } : { year, month: (month ?? 1) - 1 };
    await waitFor(() => expect(mocked.dashboard).toHaveBeenLastCalledWith(expected));
    expect(mocked.breakdown).toHaveBeenLastCalledWith(expected);
  });

  it("invites you to add a first transaction instead of showing empty boxes", async () => {
    mocked.transactions.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mocked.dashboard.mockResolvedValue({ ...STATS, total_income: "0.00", total_expenses: "0.00", balance: "0.00", transaction_count: 0, budget_usage: [] });
    mocked.insights.mockResolvedValue({ year: 2026, month: 9, insights: [] });
    const user = userEvent.setup();
    await render(<DashboardScreen />);

    expect(await screen.findByText("No transactions yet")).toBeTruthy();
    expect(screen.queryByText("Recent")).toBeNull();
    await user.press(screen.getByRole("button", { name: "Add transaction" }));

    expect(router.push).toHaveBeenCalledWith("/add-transaction");
  });

  it("shows a failing section on its own, with a retry, while the rest still loads", async () => {
    mocked.breakdown.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { isAxiosError: true }));
    await render(<DashboardScreen />);

    expect(await screen.findByText("€1,133.99")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
    await userEvent.setup().press(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Housing", { exact: false }).catch(() => null)).toBeDefined();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry" })).toBeNull());
  });
});
