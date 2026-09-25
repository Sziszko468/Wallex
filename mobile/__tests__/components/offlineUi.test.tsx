import { render, screen, userEvent } from "@testing-library/react-native";
import { OfflineBanner } from "../../components/OfflineBanner";
import { PendingTransactionsList } from "../../components/transactions/PendingTransactionsList";
import { useOffline } from "../../hooks/useOffline";
import type { PendingTransaction } from "../../services/outbox";
import type { Category } from "../../types/category";

jest.mock("../../hooks/useOffline", () => ({ useOffline: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const mockUseOffline = jest.mocked(useOffline);

function offlineState(overrides: Partial<ReturnType<typeof useOffline>> = {}) {
  mockUseOffline.mockReturnValue({
    isOffline: false,
    cacheServedAt: null,
    pendingTransactions: [],
    pendingCount: 0,
    failedCount: 0,
    isSyncing: false,
    dataVersion: 0,
    saveOffline: jest.fn(),
    syncNow: jest.fn(async () => undefined),
    retry: jest.fn(),
    discard: jest.fn(),
    ...overrides,
  });
}

describe("OfflineBanner", () => {
  it("is invisible when everything is online and synced", async () => {
    offlineState();
    await render(<OfflineBanner />);
    expect(screen.toJSON()).toBeNull();
  });

  it("offline: says the data is saved data and how many items wait", async () => {
    offlineState({ isOffline: true, pendingCount: 2, cacheServedAt: new Date(2026, 8, 24, 19, 35).getTime() });
    await render(<OfflineBanner />);

    expect(screen.getByText(/You're offline\. Showing data saved .*2 transactions will sync/)).toBeTruthy();
  });

  it("online with pending items: offers to sync now", async () => {
    const syncNow = jest.fn(async () => undefined);
    offlineState({ pendingCount: 1, syncNow });
    await render(<OfflineBanner />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Sync now" }));

    expect(screen.getByText("1 transaction waiting to sync.")).toBeTruthy();
    expect(syncNow).toHaveBeenCalled();
  });

  it("failed items take priority: the user is asked to review them", async () => {
    offlineState({ pendingCount: 3, failedCount: 1 });
    await render(<OfflineBanner />);

    expect(screen.getByText("1 transaction couldn't be synced.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review" })).toBeTruthy();
  });
});

describe("PendingTransactionsList", () => {
  const categories = new Map<number, Category>([
    [10, { id: 10, name: "Food", type: "expense", color: "#000", icon: "", is_system: true, created_at: "", updated_at: "" }],
  ]);
  const item = (overrides: Partial<PendingTransaction>): PendingTransaction => ({
    client_id: "id-1",
    payload: { amount: "12.50", type: "expense", category: 10, description: "Taxi", date: "2026-09-24" },
    status: "pending",
    attempts: 0,
    last_error: null,
    created_at: "",
    next_attempt_at: null,
    ...overrides,
  });

  it("marks unsynced items separately from server data", async () => {
    await render(
      <PendingTransactionsList items={[item({})]} categoriesById={categories} onRetry={jest.fn()} onDiscard={jest.fn()} />
    );

    expect(screen.getByText("Not synced yet")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull(); // pending ones sync on their own
  });

  it("a failed item shows why and lets the user retry or discard it", async () => {
    const onRetry = jest.fn();
    const onDiscard = jest.fn();
    await render(
      <PendingTransactionsList
        items={[item({ client_id: "abc", status: "failed", last_error: "Its category no longer exists." })]}
        categoriesById={categories}
        onRetry={onRetry}
        onDiscard={onDiscard}
      />
    );
    const user = userEvent.setup();

    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Its category no longer exists.")).toBeTruthy();
    await user.press(screen.getByRole("button", { name: "Retry" }));
    await user.press(screen.getByRole("button", { name: "Discard" }));

    expect(onRetry).toHaveBeenCalledWith("abc");
    expect(onDiscard).toHaveBeenCalledWith("abc");
  });
});
