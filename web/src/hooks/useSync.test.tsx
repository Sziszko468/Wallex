/**
 * Live views + SyncProvider: another device's change reaches this tab without a page reload,
 * without a loading flash, and never re-seeds data a form is editing.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { http, HttpResponse } from "msw";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../services/apiClient";
import { makeSyncStatus } from "../test/fixtures";
import { API, server } from "../test/server";
import { setAccessToken } from "../utils/tokenStorage";
import { SYNC_POLL_INTERVAL_MS } from "../utils/syncClock";
import { useAsyncData } from "./useAsyncData";
import { SyncProvider } from "./useSync";

/** The server's current sync version, and how often clients asked for it. */
function fakeSyncStatus(initial = "v1") {
  const backend = { version: initial, requests: 0 };
  server.use(
    http.get(`${API}/sync/status/`, () => {
      backend.requests += 1;
      return HttpResponse.json(makeSyncStatus(backend.version));
    })
  );
  return backend;
}

interface ProbeProps {
  fetcher: () => Promise<{ value: string }>;
  live?: boolean;
  label?: string;
  onData?: (data: { value: string } | null) => void;
}

/** Renders what a page would: a loading state, an error, or the data. */
function Probe({ fetcher, live, label = "probe", onData }: ProbeProps) {
  const { data, isLoading, error } = useAsyncData(fetcher, { live });
  useEffect(() => {
    onData?.(data);
  }, [data, onData]);
  const text = isLoading ? "loading" : error ? "error" : data?.value;
  return <p data-testid={label}>{text}</p>;
}

function comeBackToTheTab() {
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

beforeEach(() => setAccessToken("access"));

describe("SyncProvider + useAsyncData", () => {
  it("reloads a view in the background when another device changed the data", async () => {
    const status = fakeSyncStatus();
    let serverValue = "12 transactions";
    const shown: string[] = [];
    const fetcher = vi.fn(async () => ({ value: serverValue }));
    render(
      <SyncProvider>
        <Probe fetcher={fetcher} onData={(data) => data && shown.push(data.value)} />
      </SyncProvider>
    );
    expect(await screen.findByText("12 transactions")).toBeInTheDocument();
    await waitFor(() => expect(status.requests).toBe(1)); // the baseline

    serverValue = "13 transactions"; // the phone added one
    status.version = "v2";
    comeBackToTheTab();

    expect(await screen.findByText("13 transactions")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(shown).toEqual(["12 transactions", "13 transactions"]); // never blanked in between
  });

  it("a first check that comes late (the tab loaded offline) still catches changes made meanwhile", async () => {
    let reachable = false;
    let requests = 0;
    server.use(
      http.get(`${API}/sync/status/`, () => {
        requests += 1;
        return reachable ? HttpResponse.json(makeSyncStatus("v7")) : HttpResponse.error();
      })
    );
    let serverValue = "as loaded";
    const fetcher = vi.fn(async () => ({ value: serverValue }));
    render(
      <SyncProvider>
        <Probe fetcher={fetcher} />
      </SyncProvider>
    );
    await screen.findByText("as loaded");
    await waitFor(() => expect(requests).toBe(1)); // failed: no starting point yet

    serverValue = "changed on the phone";
    reachable = true;
    comeBackToTheTab();

    expect(await screen.findByText("changed on the phone")).toBeInTheDocument();
  });

  it("doesn't reload when nothing changed", async () => {
    const status = fakeSyncStatus();
    const fetcher = vi.fn(async () => ({ value: "same" }));
    render(
      <SyncProvider>
        <Probe fetcher={fetcher} />
      </SyncProvider>
    );
    await screen.findByText("same");

    comeBackToTheTab();
    await waitFor(() => expect(status.requests).toBe(2));

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("checks every 30 seconds while the tab is visible, and not while it's hidden", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const status = fakeSyncStatus();
      render(
        <SyncProvider>
          <Probe fetcher={async () => ({ value: "x" })} />
        </SyncProvider>
      );
      // Testing Library's waitFor polls with the (now fake) setInterval; vi.waitFor uses real timers.
      await vi.waitFor(() => expect(status.requests).toBe(1));

      act(() => void vi.advanceTimersByTime(SYNC_POLL_INTERVAL_MS));
      await vi.waitFor(() => expect(status.requests).toBe(2));

      const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      act(() => void vi.advanceTimersByTime(SYNC_POLL_INTERVAL_MS * 3));
      expect(status.requests).toBe(2);
      visibility.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("this tab's own writes reload every live view at once", async () => {
    const status = fakeSyncStatus();
    server.use(http.post(`${API}/budgets/`, () => HttpResponse.json({ id: 1 }, { status: 201 })));
    let budgets = "no budget";
    render(
      <SyncProvider>
        <Probe fetcher={async () => ({ value: budgets })} />
      </SyncProvider>
    );
    await screen.findByText("no budget");
    await waitFor(() => expect(status.requests).toBe(1));

    budgets = "1 budget";
    status.version = "v2";
    await act(async () => {
      await apiClient.post("/budgets/", {}); // e.g. a form elsewhere on the page
    });

    expect(await screen.findByText("1 budget")).toBeInTheDocument();
  });

  it("leaves data a form is editing alone (live: false)", async () => {
    const status = fakeSyncStatus();
    const fetcher = vi.fn(async () => ({ value: "as loaded" }));
    render(
      <SyncProvider>
        <Probe fetcher={fetcher} live={false} />
      </SyncProvider>
    );
    await screen.findByText("as loaded");
    await waitFor(() => expect(status.requests).toBe(1));

    status.version = "v2";
    comeBackToTheTab();
    await waitFor(() => expect(status.requests).toBe(2));

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("a view that loaded after the change was detected doesn't load twice", async () => {
    const status = fakeSyncStatus();
    const first = async () => ({ value: "first" });
    const { rerender } = render(
      <SyncProvider>
        <Probe fetcher={first} />
      </SyncProvider>
    );
    await screen.findByText("first");
    await waitFor(() => expect(status.requests).toBe(1));
    status.version = "v2";
    comeBackToTheTab();
    await waitFor(() => expect(status.requests).toBe(2));

    // E.g. the user opens another page: its views mount inside the same provider.
    const later = vi.fn(async () => ({ value: "second" }));
    rerender(
      <SyncProvider>
        <Probe fetcher={first} />
        <Probe fetcher={later} label="later" />
      </SyncProvider>
    );

    expect(await screen.findByText("second")).toBeInTheDocument();
    await act(async () => {});
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("keeps showing the data when a background reload fails, but not when the object is gone", async () => {
    const status = fakeSyncStatus();
    let failure: unknown = null;
    const fetcher = vi.fn(async () => {
      if (failure) throw failure;
      return { value: "Groceries" };
    });
    render(
      <SyncProvider>
        <Probe fetcher={fetcher} />
      </SyncProvider>
    );
    await screen.findByText("Groceries");
    await waitFor(() => expect(status.requests).toBe(1));

    failure = new AxiosError("Network Error", "ERR_NETWORK");
    status.version = "v2";
    comeBackToTheTab();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("probe")).toHaveTextContent("Groceries");

    failure = new AxiosError("Not found", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 404,
      data: { detail: "No Transaction matches the given query." },
    } as AxiosResponse);
    status.version = "v3"; // deleted on another device
    comeBackToTheTab();

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("error"));
  });

  it("unchanged data keeps its identity, so nothing downstream re-runs", async () => {
    const status = fakeSyncStatus();
    const received: unknown[] = [];
    render(
      <SyncProvider>
        <Probe fetcher={async () => ({ value: "same content" })} onData={(data) => received.push(data)} />
      </SyncProvider>
    );
    await screen.findByText("same content");
    await waitFor(() => expect(status.requests).toBe(1));

    status.version = "v2"; // something else changed (e.g. a budget), not this view's data
    comeBackToTheTab();
    await waitFor(() => expect(status.requests).toBe(2));
    await act(async () => {});

    expect(received.filter(Boolean)).toHaveLength(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
