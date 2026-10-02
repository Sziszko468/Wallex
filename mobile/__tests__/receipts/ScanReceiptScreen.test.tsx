/**
 * The whole scan flow on one screen: camera → scan → problem or confirmation → Save.
 * The rule that matters most: a transaction is created ONLY by the Save button.
 */
import { render, screen, userEvent } from "@testing-library/react-native";
import { ScanReceiptScreen } from "../../screens/ScanReceiptScreen";
import { scanReceipt } from "../../services/receiptService";
import type { ReceiptScan } from "../../types/receipt";

const mockCreate = jest.fn(async (_payload: unknown) => ({ savedOffline: false }));
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({ router: { replace: (path: string) => mockReplace(path), back: jest.fn() } }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: "file:///receipt.jpg", width: 3000 }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: "file:///other.jpg", width: 1200 }] })),
}));
jest.mock("../../services/receiptService", () => ({ scanReceipt: jest.fn() }));
jest.mock("../../services/categoriesService", () => ({
  listCategories: jest.fn(async () => [
    { id: 10, name: "Food", type: "expense", color: "#16a34a", icon: "", is_system: true, created_at: "", updated_at: "" },
  ]),
}));
jest.mock("../../hooks/useCreateTransaction", () => ({
  useCreateTransaction: () => ({ create: (payload: unknown) => mockCreate(payload), isOffline: false }),
}));
jest.mock("../../hooks/useBaseCurrency", () => ({ useBaseCurrency: () => "EUR" }));

const mockedScan = scanReceipt as jest.MockedFunction<typeof scanReceipt>;

const completeScan: ReceiptScan = {
  merchant: { value: "SPAR Magyarország Kft", confidence: "high" },
  amount: { value: "2056.00", confidence: "high" },
  date: { value: "2026-09-24", confidence: "high" },
  currency: { value: "HUF", confidence: "high" },
  unsupported_currency: null,
  items: [{ name: "KENYÉR", amount: "549.00" }],
  category: { id: 10, name: "Food", source: "rules" },
  text_found: true,
  outcome: "complete",
};

function httpError(status: number, data: unknown) {
  return Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } });
}

async function takePhoto() {
  const user = userEvent.setup();
  await render(<ScanReceiptScreen />);
  await user.press(screen.getByRole("button", { name: "Take photo" }));
  return user;
}

beforeEach(() => {
  mockCreate.mockClear();
  mockReplace.mockClear();
  mockedScan.mockReset();
});

describe("ScanReceiptScreen", () => {
  it("a scan shows the confirmation and creates nothing until Save Transaction", async () => {
    mockedScan.mockResolvedValue(completeScan);
    const user = await takePhoto();

    expect(await screen.findByText("Check the details")).toBeTruthy();
    expect(mockedScan).toHaveBeenCalledWith({ uri: "file:///receipt.jpg", width: 3000 });
    expect(mockCreate).not.toHaveBeenCalled();

    await user.press(screen.getByRole("button", { name: "Save Transaction" }));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      type: "expense",
      amount: "2056.00",
      currency: "HUF",
      category: 10,
      description: "SPAR Magyarország Kft",
      date: "2026-09-24",
    });
  });

  it("an unreadable photo: retake, another photo or manual entry — nothing to confirm", async () => {
    mockedScan.mockResolvedValue({ ...completeScan, text_found: false, outcome: "unreadable" });
    const user = await takePhoto();

    expect(await screen.findByText("We couldn't read this photo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retake photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose another photo" })).toBeTruthy();
    expect(screen.queryByText("Check the details")).toBeNull();

    await user.press(screen.getByRole("button", { name: "Add manually" }));

    expect(mockReplace).toHaveBeenCalledWith("/add-transaction");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("not a receipt: the user can still choose to enter the details", async () => {
    mockedScan.mockResolvedValue({
      ...completeScan,
      amount: { value: null, confidence: "low" },
      date: { value: null, confidence: "low" },
      outcome: "unsupported",
    });
    const user = await takePhoto();

    expect(await screen.findByText("This doesn't look like a receipt")).toBeTruthy();
    await user.press(screen.getByRole("button", { name: "Enter the details anyway" }));

    expect(await screen.findByText("Check the details")).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("a rejected photo shows the server's reason", async () => {
    mockedScan.mockRejectedValue(httpError(400, { image: ["Please upload a JPEG or PNG photo."] }));
    await takePhoto();

    expect(await screen.findByText("This photo can't be used")).toBeTruthy();
    expect(screen.getByText("Please upload a JPEG or PNG photo.")).toBeTruthy();
  });

  it("an OCR outage offers manual entry only", async () => {
    mockedScan.mockRejectedValue(
      httpError(503, { detail: "Receipt scanning is temporarily unavailable. Please add the transaction manually." })
    );
    await takePhoto();

    expect(await screen.findByText("Scanning is unavailable right now")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add manually" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retake photo" })).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("retaking after a problem scans the new photo", async () => {
    mockedScan
      .mockResolvedValueOnce({ ...completeScan, text_found: false, outcome: "unreadable" })
      .mockResolvedValueOnce(completeScan);
    const user = await takePhoto();

    await user.press(await screen.findByRole("button", { name: "Choose another photo" }));

    expect(await screen.findByText("Check the details")).toBeTruthy();
    expect(mockedScan).toHaveBeenLastCalledWith({ uri: "file:///other.jpg", width: 1200 });
  });

  it("without camera permission nothing is scanned", async () => {
    const picker = jest.requireMock("expo-image-picker");
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true });
    await takePhoto();

    expect(await screen.findByText("WALLEX needs camera access to scan receipts.")).toBeTruthy();
    expect(mockedScan).not.toHaveBeenCalled();
  });
});
