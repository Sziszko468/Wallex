import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";
import { clearTokens } from "../utils/tokenStorage";

// Recharts measures its container; jsdom has no layout engine.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom has no layout or scrolling; AppLayout scrolls to the top on navigation.
window.scrollTo = () => undefined;

// Any request without a handler is a test bug — fail loudly instead of hitting a real server.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  clearTokens(); // the access token lives in module memory
});
afterAll(() => server.close());
