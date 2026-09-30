import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installMatchMedia } from "../test/matchMedia";
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from "./useTheme";

function Probe() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <p data-testid="state">
        {preference}/{resolvedTheme}
      </p>
      <button onClick={() => setPreference("light")}>Light</button>
      <button onClick={() => setPreference("dark")}>Dark</button>
      <button onClick={() => setPreference("system")}>System</button>
    </div>
  );
}

const root = document.documentElement;

describe("Theme preference", () => {
  let media: ReturnType<typeof installMatchMedia>;

  beforeEach(() => {
    media = installMatchMedia({ dark: false });
  });

  afterEach(() => {
    media.uninstall();
    root.removeAttribute("data-theme");
    root.classList.remove("theme-transition");
  });

  it("follows the operating system by default, without pinning a theme", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);

    expect(screen.getByTestId("state")).toHaveTextContent("system/light");
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("uses the dark theme when the system is dark and the choice is System", () => {
    media.uninstall();
    media = installMatchMedia({ dark: true });
    render(<ThemeProvider><Probe /></ThemeProvider>);

    expect(screen.getByTestId("state")).toHaveTextContent("system/dark");
  });

  it("pins Light or Dark, remembers the choice, and lets go again for System", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByTestId("state")).toHaveTextContent("dark/dark");

    await user.click(screen.getByRole("button", { name: "Light" }));
    expect(root).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    await user.click(screen.getByRole("button", { name: "System" }));
    expect(root).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("restores the saved choice on the next visit", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeProvider><Probe /></ThemeProvider>);

    expect(screen.getByTestId("state")).toHaveTextContent("dark/dark");
    expect(root).toHaveAttribute("data-theme", "dark");
  });

  it("ignores a saved value it doesn't understand", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    render(<ThemeProvider><Probe /></ThemeProvider>);

    expect(screen.getByTestId("state")).toHaveTextContent("system/light");
  });

  it("reacts when the device switches to dark while System is selected", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("state")).toHaveTextContent("system/light");

    act(() => media.setSystemDark(true));

    expect(screen.getByTestId("state")).toHaveTextContent("system/dark");
  });

  it("does not override an explicit choice when the device changes", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "Light" }));

    act(() => media.setSystemDark(true));

    expect(screen.getByTestId("state")).toHaveTextContent("light/light");
    expect(root).toHaveAttribute("data-theme", "light");
  });

  it("follows a change made in another tab", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }));
    });

    expect(screen.getByTestId("state")).toHaveTextContent("dark/dark");
  });

  it("cross-fades a manual change, but not for reduced-motion users", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(root).toHaveClass("theme-transition");

    root.classList.remove("theme-transition");
    media.uninstall();
    media = installMatchMedia({ reducedMotion: true });
    await user.click(screen.getByRole("button", { name: "Light" }));
    expect(root).not.toHaveClass("theme-transition");
  });

  it("keeps working when browser storage is blocked", async () => {
    const user = userEvent.setup();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      render(<ThemeProvider><Probe /></ThemeProvider>);
      await user.click(screen.getByRole("button", { name: "Dark" }));
      expect(screen.getByTestId("state")).toHaveTextContent("dark/dark");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
