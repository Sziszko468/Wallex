import { render, screen } from "@testing-library/react-native";
import { BudgetsScreen } from "../../screens/BudgetsScreen";
import { listBudgets } from "../../services/budgetsService";
import { listCategories } from "../../services/categoriesService";
import type { Budget } from "../../types/budget";
import type { Category } from "../../types/category";
import { budgetStateOf } from "../../components/budgets/BudgetRow";

jest.mock("../../hooks/useOffline", () => ({ useRefetchOnDataChange: jest.fn() }));
jest.mock("../../hooks/useBaseCurrency", () => ({ useBaseCurrency: () => "EUR" }));
jest.mock("../../services/budgetsService", () => ({ listBudgets: jest.fn() }));
jest.mock("../../services/categoriesService", () => ({ listCategories: jest.fn() }));

const food: Category = { id: 10, name: "Food", type: "expense", color: "#10b981", icon: "", is_system: true, created_at: "", updated_at: "" };
const transport: Category = { id: 11, name: "Transport", type: "expense", color: "#3b82f6", icon: "", is_system: true, created_at: "", updated_at: "" };

const NOW = new Date();
function budget(id: number, categoryId: number | null, spent: string, amount: string, usage: number, month = NOW.getMonth() + 1): Budget {
  return {
    id,
    category: categoryId,
    amount,
    year: NOW.getFullYear(),
    month,
    spent_amount: spent,
    remaining_amount: (Number(amount) - Number(spent)).toFixed(2),
    usage_percentage: usage,
    created_at: "",
    updated_at: "",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (listCategories as jest.Mock).mockResolvedValue([food, transport]);
});

describe("budgetStateOf", () => {
  it.each([
    [0, "onTrack"],
    [79.9, "onTrack"],
    [80, "nearLimit"],
    [100, "nearLimit"],
    [100.1, "over"],
    [250, "over"],
  ] as const)("%s%% used is %s", (usage, state) => {
    expect(budgetStateOf(usage)).toBe(state);
  });
});

describe("BudgetsScreen", () => {
  it("puts the overall budget first, then each category fullest first, each with its status in words", async () => {
    (listBudgets as jest.Mock).mockResolvedValue([
      budget(1, 10, "340.75", "450.00", 75.7),
      budget(2, null, "1653.62", "2000.00", 82.7),
      budget(3, 11, "188.20", "160.00", 117.6),
    ]);
    await render(<BudgetsScreen />);

    expect(await screen.findByText("Overall")).toBeTruthy();
    expect(screen.getByText("By category")).toBeTruthy();
    const names = screen.getAllByText(/^(Overall|Transport|Food)$/).map((node) => node.props.children);
    expect(names).toEqual(["Overall", "Transport", "Food"]);
    expect(screen.getByText("Over budget")).toBeTruthy();
    expect(screen.getByText("Near limit")).toBeTruthy();
    expect(screen.getByText("On track")).toBeTruthy();
    expect(screen.getByText("Over by €28.20")).toBeTruthy();
    expect(screen.getByText("€109.25 left")).toBeTruthy();
  });

  it("shows only the selected month's budgets", async () => {
    (listBudgets as jest.Mock).mockResolvedValue([budget(1, 10, "10.00", "100.00", 10), budget(2, 11, "50.00", "100.00", 50, NOW.getMonth() === 0 ? 12 : NOW.getMonth())]);
    await render(<BudgetsScreen />);

    expect(await screen.findByText("Food")).toBeTruthy();
    expect(screen.queryByText("Transport")).toBeNull();
  });

  it("says so when no budget is set for the month", async () => {
    (listBudgets as jest.Mock).mockResolvedValue([]);
    await render(<BudgetsScreen />);

    expect(await screen.findByText("No budgets set for this month.")).toBeTruthy();
  });
});
