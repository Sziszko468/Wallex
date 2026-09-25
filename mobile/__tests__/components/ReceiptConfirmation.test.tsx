import { render, screen, userEvent } from "@testing-library/react-native";
import { ReceiptConfirmation } from "../../components/receipts/ReceiptConfirmation";
import type { Category } from "../../types/category";
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
  category: { id: 10, name: "Food", source: "rules" },
  text_found: true,
};

async function renderConfirmation(scan: ReceiptScan, onSave = jest.fn(async () => ({ savedOffline: false }))) {
  await render(
    <ReceiptConfirmation scan={scan} categories={categories} isOffline={false} onSave={onSave} onRetake={jest.fn()} />
  );
  return { onSave, user: userEvent.setup() };
}

describe("ReceiptConfirmation", () => {
  it("prefills every scanned field and preselects the suggested category", async () => {
    await renderConfirmation(confidentScan);

    expect(screen.getByLabelText("Merchant").props.value).toBe("TESCO Global Zrt");
    expect(screen.getByLabelText("Amount").props.value).toBe("2142.00");
    expect(screen.getByLabelText("Date").props.value).toBe("2026-09-25");
    expect(screen.getByRole("button", { name: "Food" })).toBeSelected();
    expect(screen.getByText("Suggested from the merchant name.")).toBeTruthy();
    // Only expense categories can be chosen for a receipt.
    expect(screen.queryByRole("button", { name: "Salary" })).toBeNull();
  });

  it("nothing is saved until Save is pressed — and then exactly what the user confirmed", async () => {
    const { onSave, user } = await renderConfirmation(confidentScan);
    expect(onSave).not.toHaveBeenCalled();

    await user.press(screen.getByRole("button", { name: "Transport" }));
    await user.press(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ merchant: "TESCO Global Zrt", amount: "2142.00", date: "2026-09-25", category: 11 });
  });

  it("flags uncertain and missing fields for the user to check", async () => {
    await renderConfirmation({
      ...confidentScan,
      merchant: { value: "Corner Coffee", confidence: "low" },
      amount: { value: null, confidence: "low" },
      category: null,
    });

    expect(screen.getByText(/We weren't sure about this/)).toBeTruthy();
    expect(screen.getByText(/Total not found on the receipt/)).toBeTruthy();
    expect(screen.getByText("Choose a category.")).toBeTruthy();
  });

  it("refuses to save incomplete or invalid data", async () => {
    const { onSave, user } = await renderConfirmation({
      ...confidentScan,
      merchant: { value: null, confidence: "low" },
      amount: { value: "0", confidence: "low" },
      category: null,
    });

    await user.press(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Merchant is required.")).toBeTruthy();
    expect(screen.getByText("Amount must be greater than 0.")).toBeTruthy();
  });

  it("accepts a comma decimal separator and sends a dot", async () => {
    const { onSave, user } = await renderConfirmation({ ...confidentScan, amount: { value: null, confidence: "low" } });

    await user.type(screen.getByLabelText("Amount"), "12,50");
    await user.press(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: "12.50" }));
  });

  it("shows the backend's rejection and keeps the form", async () => {
    const onSave = jest.fn(async () => {
      throw Object.assign(new Error("Request failed"), {
        isAxiosError: true,
        response: { status: 400, data: { description: ["Ensure this field has no more than 255 characters."] } },
      });
    });
    const { user } = await renderConfirmation(confidentScan, onSave);

    await user.press(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findAllByText("Ensure this field has no more than 255 characters.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });
});
