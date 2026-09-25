import { act, renderHook } from "@testing-library/react-native";
import { useCreateTransaction } from "../../hooks/useCreateTransaction";
import { useOffline } from "../../hooks/useOffline";
import { createTransaction } from "../../services/transactionsService";
import { httpError, networkError } from "../helpers/tokens";

jest.mock("../../hooks/useOffline", () => ({ useOffline: jest.fn() }));
jest.mock("../../services/transactionsService", () => ({ createTransaction: jest.fn() }));

const mockCreate = jest.mocked(createTransaction);
const saveOffline = jest.fn(async () => undefined);

function setOffline(isOffline: boolean) {
  jest.mocked(useOffline).mockReturnValue({ isOffline, saveOffline } as unknown as ReturnType<typeof useOffline>);
}

const payload = { amount: "12.50", type: "expense" as const, category: 10, description: "Taxi", date: "2026-09-24" };

async function renderCreate() {
  const { result } = await renderHook(() => useCreateTransaction());
  return result;
}

describe("creating a transaction (online / offline)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    saveOffline.mockClear();
  });

  it("online: posts it with an idempotency key", async () => {
    setOffline(false);
    mockCreate.mockResolvedValue({} as Awaited<ReturnType<typeof createTransaction>>);
    const result = await renderCreate();

    let outcome: { savedOffline: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.create(payload);
    });

    expect(outcome).toEqual({ savedOffline: false });
    expect(mockCreate).toHaveBeenCalledWith({ ...payload, client_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(saveOffline).not.toHaveBeenCalled();
  });

  it("offline: queues it locally instead of calling the API", async () => {
    setOffline(true);
    const result = await renderCreate();

    let outcome: { savedOffline: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.create(payload);
    });

    expect(outcome).toEqual({ savedOffline: true });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(saveOffline).toHaveBeenCalledWith({ ...payload, client_id: expect.any(String) });
  });

  it("connection lost mid-request: queues it with the SAME key the server may already have", async () => {
    setOffline(false);
    mockCreate.mockRejectedValue(networkError());
    const result = await renderCreate();

    await act(async () => {
      await result.current.create(payload);
    });

    const sentKey = mockCreate.mock.calls[0]![0].client_id;
    expect(saveOffline).toHaveBeenCalledWith(expect.objectContaining({ client_id: sentKey }));
  });

  it("every attempt from the same form reuses one key (double tap can't duplicate)", async () => {
    setOffline(false);
    mockCreate.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce({} as never);
    const result = await renderCreate();

    await act(async () => {
      await expect(result.current.create(payload)).rejects.toBeDefined();
      await result.current.create(payload);
    });

    const [first, second] = mockCreate.mock.calls.map(([sent]) => sent.client_id);
    expect(first).toBe(second);
  });

  it("validation errors are NOT queued — they go back to the form", async () => {
    setOffline(false);
    mockCreate.mockRejectedValue(httpError(400, { amount: ["Invalid."] }));
    const result = await renderCreate();

    await act(async () => {
      await expect(result.current.create(payload)).rejects.toMatchObject({ response: { status: 400 } });
    });
    expect(saveOffline).not.toHaveBeenCalled();
  });
});
