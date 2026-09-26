import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react-native";
import { TransactionListItem } from "../../components/transactions/TransactionListItem";
import { useAuth } from "../../hooks/useAuth";
import type { Transaction } from "../../types/transaction";
import { formatCurrency } from "../../utils/format";
import { hasValidPrecision } from "../../utils/currency";

jest.mock("../../hooks/useAuth", () => ({ useAuth: jest.fn() }));

const mockUseAuth = jest.mocked(useAuth);

function signedInWithBase(base_currency: "EUR" | "HUF") {
  mockUseAuth.mockReturnValue({
    user: { id: 1, email: "anna@example.com", first_name: "Anna", last_name: "", date_joined: "2026-09-01", base_currency },
  } as ReturnType<typeof useAuth>);
}

const lunch: Transaction = {
  id: 3,
  amount: "15000.00",
  currency: "HUF",
  exchange_rate: "0.0025650891",
  base_amount: "38.48",
  type: "expense",
  category: 10,
  description: "Lunch in Budapest",
  date: "2026-09-25",
  client_id: null,
  created_at: "2026-09-25T12:00:00Z",
  updated_at: "2026-09-25T12:00:00Z",
};

// Intl output depends on the device locale; these checks pin digits, decimals and the currency.
describe("formatCurrency", () => {
  it("shows whole forints and yen, and cents for the other currencies", () => {
    expect(formatCurrency("15000.00", "HUF")).toMatch(/15[\s.,]?000(?![.,]\d)/);
    expect(formatCurrency("1600", "JPY")).toMatch(/1[\s.,]?600(?![.,]\d)/);
    expect(formatCurrency("12.5", "EUR")).toMatch(/12[.,]50/);
  });

  it("uses the given currency", () => {
    expect(formatCurrency("1", "HUF")).toMatch(/HUF|Ft/);
    expect(formatCurrency("1", "USD")).toMatch(/\$|USD/);
  });

  it("whole-number currencies reject decimals, however they are written", () => {
    expect(hasValidPrecision("15000.00", "HUF")).toBe(true);
    expect(hasValidPrecision("15000.5", "HUF")).toBe(false);
    expect(hasValidPrecision("12.34", "EUR")).toBe(true);
  });
});

describe("TransactionListItem", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

  it("shows a foreign-currency amount as paid, with its value in the base currency", async () => {
    signedInWithBase("EUR");

    await render(<TransactionListItem transaction={lunch} onPress={() => undefined} />, { wrapper });

    expect(screen.getByText(/15[\s.,]?000/)).toHaveTextContent(/HUF|Ft/);
    expect(screen.getByText(/≈ .*38[.,]48/)).toHaveTextContent(/€|EUR/);
  });

  it("shows no conversion for a transaction in the base currency", async () => {
    signedInWithBase("HUF");

    await render(<TransactionListItem transaction={lunch} onPress={() => undefined} />, { wrapper });

    expect(screen.getByText(/15[\s.,]?000/)).toBeTruthy();
    expect(screen.queryByText(/≈/)).toBeNull();
  });
});
