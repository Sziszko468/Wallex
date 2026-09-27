/**
 * The phone stays in step with the account's other devices: screens reload in the background
 * when the server's data changed — on returning to the foreground, every 30 s while in the
 * foreground, when the connection comes back, and right after the app's own writes.
 */
import { act, render, screen } from "@testing-library/react-native";
import { AppState, Text, type AppStateStatus } from "react-native";
import { useAsyncData } from "../../hooks/useAsyncData";
import { SyncProvider } from "../../hooks/useSync";
import { notifyLocalWrite } from "../../services/localWrites";
import { getSyncStatus } from "../../services/syncService";
import type { SyncStatus } from "../../types/sync";
import { SYNC_POLL_INTERVAL_MS } from "../../utils/syncClock";

let mockOffline = false;
jest.mock("../../hooks/useOffline", () => ({ useOffline: () => ({ isOffline: mockOffline }) }));
jest.mock("../../services/syncService", () => ({ getSyncStatus: jest.fn() }));

const mockedStatus = getSyncStatus as jest.MockedFunction<typeof getSyncStatus>;

function status(version: string): SyncStatus {
  const state = { count: 0, last_modified: null };
  return {
    version,
    server_time: "2026-09-27T12:00:00Z",
    resources: {
      transactions: state,
      categories: state,
      budgets: state,
      recurring_transactions: state,
      savings_goals: state,
    },
  };
}

let appStateListener: ((state: AppStateStatus) => void) | null = null;
let serverVersion = "v1";
let serverValue = "12 transactions";
const fetcher = jest.fn(async () => serverValue);

function Screen() {
  const { data, isLoading } = useAsyncData(fetcher);
  return <Text testID="screen">{isLoading ? "loading" : data}</Text>;
}

function Tree() {
  return (
    <SyncProvider>
      <Screen />
    </SyncProvider>
  );
}

/** The React Native jest preset mocks AppState as a plain object: set the state directly. */
function setAppState(state: AppStateStatus) {
  (AppState as { currentState: AppStateStatus }).currentState = state;
}

async function flush() {
  await act(async () => {});
}

beforeEach(() => {
  mockOffline = false;
  serverVersion = "v1";
  serverValue = "12 transactions";
  fetcher.mockClear();
  mockedStatus.mockReset().mockImplementation(async () => status(serverVersion));
  setAppState("active");
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("SyncProvider on the phone", () => {
  it("coming back to the app shows what the web added meanwhile, without a spinner", async () => {
    await render(<Tree />);
    expect(await screen.findByText("12 transactions")).toBeTruthy();
    expect(mockedStatus).toHaveBeenCalledTimes(1); // the baseline

    serverValue = "13 transactions";
    serverVersion = "v2";
    await act(async () => appStateListener?.("active"));

    expect(await screen.findByText("13 transactions")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("nothing changed: nothing reloads", async () => {
    await render(<Tree />);
    await screen.findByText("12 transactions");

    await act(async () => appStateListener?.("active"));
    await flush();

    expect(mockedStatus).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("asks every 30 seconds in the foreground, never in the background", async () => {
    jest.useFakeTimers();
    await render(<Tree />);
    await flush();
    expect(mockedStatus).toHaveBeenCalledTimes(1);

    await act(async () => jest.advanceTimersByTime(SYNC_POLL_INTERVAL_MS));
    expect(mockedStatus).toHaveBeenCalledTimes(2);

    setAppState("background");
    await act(async () => jest.advanceTimersByTime(SYNC_POLL_INTERVAL_MS * 3));
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it("doesn't ask while offline; back online, it catches what changed meanwhile", async () => {
    mockOffline = true;
    const view = await render(<Tree />);
    await screen.findByText("12 transactions"); // e.g. from the offline cache
    expect(mockedStatus).not.toHaveBeenCalled();

    serverValue = "13 transactions"; // the web added one while the phone was offline
    mockOffline = false;
    await view.rerender(<Tree />);

    expect(await screen.findByText("13 transactions")).toBeTruthy();
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it("started in the background: a change made before the user opens the app still shows up", async () => {
    setAppState("background");
    await render(<Tree />);
    await screen.findByText("12 transactions");
    expect(mockedStatus).toHaveBeenCalledTimes(1); // the starting point is fixed even in the background

    serverValue = "13 transactions";
    serverVersion = "v2";
    setAppState("active");
    await act(async () => appStateListener?.("active"));

    expect(await screen.findByText("13 transactions")).toBeTruthy();
  });

  it("the app's own write reloads every mounted screen", async () => {
    await render(<Tree />);
    await screen.findByText("12 transactions");
    await flush();

    serverValue = "13 transactions";
    serverVersion = "v2";
    await act(async () => notifyLocalWrite()); // what apiClient does after a successful POST/PATCH/DELETE

    expect(await screen.findByText("13 transactions")).toBeTruthy();
  });
});
