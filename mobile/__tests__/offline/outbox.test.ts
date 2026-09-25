import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  discardPending,
  enqueueTransaction,
  getOutboxSnapshot,
  loadOutbox,
  resetOutbox,
  retryPending,
  syncOutbox,
} from "../../services/outbox";
import { createTransaction } from "../../services/transactionsService";
import { SessionExpiredError } from "../../services/session";
import { setOfflineUser } from "../../utils/offlineStore";
import { httpError, networkError } from "../helpers/tokens";
import type { CreateTransactionPayload } from "../../types/transaction";

jest.mock("../../services/transactionsService", () => ({ createTransaction: jest.fn() }));
const mockCreate = jest.mocked(createTransaction);

const payload = (description: string): CreateTransactionPayload => ({
  amount: "12.50",
  type: "expense",
  category: 10,
  description,
  date: "2026-09-24",
});

const savedTransaction = { id: 1 } as Awaited<ReturnType<typeof createTransaction>>;

async function signInAs(userId: number) {
  resetOutbox();
  setOfflineUser(userId);
  await loadOutbox();
}

describe("offline outbox", () => {
  beforeEach(async () => {
    mockCreate.mockReset();
    await signInAs(1);
  });

  it("keeps a transaction recorded offline, with a unique idempotency key", async () => {
    const first = await enqueueTransaction(payload("Taxi"));
    const second = await enqueueTransaction(payload("Coffee"));

    expect(getOutboxSnapshot().map((item) => item.status)).toEqual(["pending", "pending"]);
    expect(first.client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.client_id).not.toBe(second.client_id);
  });

  it("survives an app restart (persisted per user)", async () => {
    await enqueueTransaction(payload("Taxi"));

    await signInAs(1); // restart: memory gone, reload from storage
    expect(getOutboxSnapshot().map((item) => item.payload.description)).toEqual(["Taxi"]);
  });

  it("never exposes one account's pending items to another account", async () => {
    await enqueueTransaction(payload("Anna's taxi"));

    await signInAs(2);
    expect(getOutboxSnapshot()).toEqual([]);
    await syncOutbox();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("reuses a client_id the form already sent, so a lost response can't duplicate", async () => {
    const item = await enqueueTransaction({ ...payload("Taxi"), client_id: "11111111-1111-4111-8111-111111111111" });

    expect(item.client_id).toBe("11111111-1111-4111-8111-111111111111");
    await expect(
      enqueueTransaction({ ...payload("Taxi"), client_id: "11111111-1111-4111-8111-111111111111" })
    ).rejects.toThrow(/already waiting/);
  });

  it("does not pretend to have saved when the device storage fails", async () => {
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk full"));

    await expect(enqueueTransaction(payload("Taxi"))).rejects.toThrow("disk full");
    expect(getOutboxSnapshot()).toEqual([]);
  });

  describe("sync", () => {
    it("sends every pending item with its own client_id and removes it on success", async () => {
      const taxi = await enqueueTransaction(payload("Taxi"));
      const coffee = await enqueueTransaction(payload("Coffee"));
      mockCreate.mockResolvedValue(savedTransaction);

      const result = await syncOutbox();

      expect(result.synced).toBe(2);
      expect(mockCreate.mock.calls.map(([sent]) => sent.client_id)).toEqual([taxi.client_id, coffee.client_id]);
      expect(getOutboxSnapshot()).toEqual([]);
      await signInAs(1);
      expect(getOutboxSnapshot()).toEqual([]); // removal persisted too
    });

    it("runs once even if triggered several times at the same moment (no double send)", async () => {
      await enqueueTransaction(payload("Taxi"));
      mockCreate.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(savedTransaction), 10)));

      await Promise.all([syncOutbox(), syncOutbox(), syncOutbox()]);

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("offline: keeps the item, backs off, and doesn't try the rest", async () => {
      await enqueueTransaction(payload("Taxi"));
      await enqueueTransaction(payload("Coffee"));
      mockCreate.mockRejectedValue(networkError());

      await syncOutbox();

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const [taxi, coffee] = getOutboxSnapshot();
      expect(taxi).toMatchObject({ status: "pending", attempts: 1 });
      expect(taxi!.next_attempt_at).toBeGreaterThan(Date.now());
      expect(coffee).toMatchObject({ status: "pending", attempts: 0 });
    });

    it("respects the backoff, then retries with the SAME client_id", async () => {
      const item = await enqueueTransaction(payload("Taxi"));
      mockCreate.mockRejectedValueOnce(networkError());
      await syncOutbox();

      await syncOutbox(); // too early: nothing sent
      expect(mockCreate).toHaveBeenCalledTimes(1);

      jest.spyOn(Date, "now").mockReturnValue(Date.now() + 60 * 60 * 1000);
      mockCreate.mockResolvedValueOnce(savedTransaction);
      await syncOutbox();

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(mockCreate.mock.calls[1]![0].client_id).toBe(item.client_id);
      expect(getOutboxSnapshot()).toEqual([]);
    });

    it("server hiccups (500) are retried later, like being offline", async () => {
      await enqueueTransaction(payload("Taxi"));
      mockCreate.mockRejectedValue(httpError(500));

      await syncOutbox();

      expect(getOutboxSnapshot()[0]).toMatchObject({ status: "pending", attempts: 1 });
    });

    it("conflict: data the server rejects is parked as failed for the user, not retried", async () => {
      await enqueueTransaction(payload("Taxi"));
      await enqueueTransaction(payload("Coffee"));
      mockCreate
        .mockRejectedValueOnce(httpError(400, { category: ['Invalid pk "10" - object does not exist.'] }))
        .mockResolvedValueOnce(savedTransaction);

      await syncOutbox();

      const [taxi] = getOutboxSnapshot();
      expect(getOutboxSnapshot()).toHaveLength(1); // Coffee still synced
      expect(taxi).toMatchObject({ status: "failed", next_attempt_at: null });
      expect(taxi!.last_error).toMatch(/category no longer exists/i);

      await syncOutbox(); // failed items are never auto-retried
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("expired session: stops and keeps everything for after the next sign-in", async () => {
      await enqueueTransaction(payload("Taxi"));
      mockCreate.mockRejectedValue(new SessionExpiredError());

      await syncOutbox();

      expect(getOutboxSnapshot()[0]).toMatchObject({ status: "pending", attempts: 0 });
    });

    it("the user can retry or discard a failed item", async () => {
      const item = await enqueueTransaction(payload("Taxi"));
      mockCreate.mockRejectedValueOnce(httpError(400, { amount: ["Invalid."] }));
      await syncOutbox();

      await retryPending(item.client_id);
      expect(getOutboxSnapshot()[0]).toMatchObject({ status: "pending", last_error: null });

      await discardPending(item.client_id);
      expect(getOutboxSnapshot()).toEqual([]);
    });
  });
});
