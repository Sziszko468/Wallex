import { render, screen, userEvent } from "@testing-library/react-native";
import { ReceiptConfirmation } from "../../components/receipts/ReceiptConfirmation";
import type { Category } from "../../types/category";
import type { CurrencyCode } from "../../types/currency";
import type { ReceiptScan } from "../../types/receipt";

const timestamps = { created_at: "", updated_at: "" };
const categories: Category[] = [
  { id: 10, name: "Food", type: "expense", color: "#16a34a", icon: "", is_system: true, ...timestamps },
  { id: 11, name: "Transport", type: "expense", color: "#2563eb", icon: "", is_system: true, ...timestamps },
  { id: 20, name: "Salary", type: "income", color: "#d97706", icon: "", is_system: true, ...timestamps },
];

const confidentScan: ReceiptScan = {
  merchant: { value: "TESCO Global Zrt", confidence: "high" },
  amount: { value: "2142.00", confidence: "high" },
  date: { value: "2026-09-25", confidence: "high" },
  currency: { value: "HUF", confidence: "high" },
  unsupported_currency: null,
  items: [
    { name: "KENYÉR", amount: "549.00" },
    { name: "TEJ 2,8% 1L", amount: "399.00" },
  ],
  category: { id: 10, name: "Food", source: "rules" },
  text_found: true,
  outcome: "complete",
};

async function renderConfirmation(
  scan: ReceiptScan,
  onSave = jest.fn(async () => ({ savedOffline: false })),
  baseCurrency: CurrencyCode = "EUR"
) {
  await render(
    <ReceiptConfirmation
      scan={scan}
      categories={categories}
      baseCurrency={baseCurrency}
      isOffline={false}
      onSave={onSave}
      onRetake={jest.fn()}
    />
  );
  return { onSave, user: userEvent.setup() };
}

function saveButton() {
  return screen.getByRole("button", { name: "Save Transaction" });
}

function axiosError(status: number, data: unknown) {
  return Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } });
}

describe("ReceiptConfirmation", () => {
  it("prefills every scanned field and preselects the suggested category and currency", async () => {
    await renderConfirmation(confidentScan);

    expect(screen.getByLabelText("Merchant").props.value).toBe("TESCO Global Zrt");
    expect(screen.getByLabelText("Amount").props.value).toBe("2142.00");
    expect(screen.getByLabelText("Date").props.value).toBe("2026-09-25");
    expect(screen.getByRole("button", { name: "HUF" })).toBeSelected();
    expect(screen.getByRole("radio", { name: "Food" })).toBeSelected();
    expect(screen.getByText("Suggested from the merchant name.")).toBeTruthy();
    // Only expense categories can be chosen for a receipt.
    expect(screen.queryByRole("radio", { name: "Salary" })).toBeNull();
  });

  it("nothing is saved until Save Transaction is pressed — and then exactly what the user confirmed", async () => {
    const { onSave, user } = await renderConfirmation(confidentScan);
    expect(onSave).not.toHaveBeenCalled();

    await user.press(screen.getByRole("radio", { name: "Transport" }));
    await user.press(saveButton());

    expect(onSave).toHaveBeenCalledWith({
      merchant: "TESCO Global Zrt",
      amount: "2142.00",
      currency: "HUF",
      date: "2026-09-25",
      category: 11,
    });
  });

  it("every field can be corrected, the currency too", async () => {
    const { onSave, user } = await renderConfirmation(confidentScan);

    await user.clear(screen.getByLabelText("Merchant"));
    await user.type(screen.getByLabelText("Merchant"), "Tesco Budaörs");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "7.50");
    await user.press(screen.getByRole("button", { name: "EUR" }));
    await user.press(saveButton());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ merchant: "Tesco Budaörs", amount: "7.50", currency: "EUR" })
    );
  });

  it("flags uncertain and missing fields for the user to check", async () => {
    await renderConfirmation({
      ...confidentScan,
      merchant: { value: "Corner Coffee", confidence: "low" },
      amount: { value: null, confidence: "low" },
      date: { value: null, confidence: "low" },
      category: null,
      outcome: "incomplete",
    });

    expect(screen.getByText(/We weren't sure about this/)).toBeTruthy();
    expect(screen.getByText(/Total not found on the receipt/)).toBeTruthy();
    expect(screen.getByText(/Date not found on the receipt — set to today/)).toBeTruthy();
    expect(screen.getByText("Choose a category.")).toBeTruthy();
  });

  it("an unrecognized merchant has to be entered", async () => {
    const { onSave, user } = await renderConfirmation({ ...confidentScan, merchant: { value: null, confidence: "low" } });

    expect(screen.getByText(/Merchant not found on the receipt/)).toBeTruthy();
    await user.press(saveButton());

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Merchant is required.")).toBeTruthy();
  });

  it("without a currency on the receipt, the base currency is preselected and flagged", async () => {
    await renderConfirmation({ ...confidentScan, currency: { value: null, confidence: "low" } }, undefined, "EUR");

    expect(screen.getByRole("button", { name: "EUR" })).toBeSelected();
    expect(screen.getByText(/Currency not found on the receipt — set to EUR/)).toBeTruthy();
  });

  it("explains a receipt in a currency WALLEX can't record", async () => {
    await renderConfirmation({
      ...confidentScan,
      currency: { value: null, confidence: "low" },
      unsupported_currency: "CZK",
      outcome: "incomplete",
    });

    expect(screen.getByText(/This receipt is in CZK, which WALLEX can't record yet/)).toBeTruthy();
  });

  it("refuses decimals in a whole-number currency", async () => {
    const { onSave, user } = await renderConfirmation({ ...confidentScan, amount: { value: "2142.50", confidence: "high" } });

    await user.press(saveButton());

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("HUF amounts can't have decimals.")).toBeTruthy();
  });

  it("refuses to save incomplete or invalid data", async () => {
    const { onSave, user } = await renderConfirmation({
      ...confidentScan,
      merchant: { value: null, confidence: "low" },
      amount: { value: "0", confidence: "low" },
      category: null,
    });

    await user.press(saveButton());

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Merchant is required.")).toBeTruthy();
    expect(screen.getByText("Amount must be greater than 0.")).toBeTruthy();
  });

  it("accepts a comma decimal separator and sends a dot", async () => {
    const { onSave, user } = await renderConfirmation({
      ...confidentScan,
      currency: { value: "EUR", confidence: "high" },
      amount: { value: null, confidence: "low" },
    });

    await user.type(screen.getByLabelText("Amount"), "12,50");
    await user.press(saveButton());

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: "12.50", currency: "EUR" }));
  });

  it("shows the items read from the receipt on request, in the receipt's currency", async () => {
    const { user } = await renderConfirmation(confidentScan);

    expect(screen.queryByText("KENYÉR")).toBeNull();
    await user.press(screen.getByRole("button", { name: /Items on the receipt \(2\)/ }));

    expect(screen.getByText("KENYÉR")).toBeTruthy();
    expect(screen.getByText(/549/)).toBeTruthy();
    expect(screen.getByText(/only the total above is saved/)).toBeTruthy();
  });

  it("shows the backend's rejection and keeps the form", async () => {
    const onSave = jest.fn(async () => {
      throw axiosError(400, { description: ["Ensure this field has no more than 255 characters."] });
    });
    const { user } = await renderConfirmation(confidentScan, onSave);

    await user.press(saveButton());

    expect((await screen.findAllByText("Ensure this field has no more than 255 characters.")).length).toBeGreaterThan(0);
    expect(saveButton()).toBeTruthy();
  });

  it("a missing exchange rate is shown at the currency", async () => {
    const message = "No HUF exchange rate is available for 2026-09-25. Enter the rate manually or try again later.";
    const onSave = jest.fn(async () => {
      throw axiosError(400, { exchange_rate: [message] });
    });
    const { user } = await renderConfirmation(confidentScan, onSave);

    await user.press(saveButton());

    expect((await screen.findAllByText(message)).length).toBe(2); // banner + next to the currency
  });
});
