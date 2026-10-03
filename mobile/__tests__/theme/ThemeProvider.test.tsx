import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, screen, userEvent } from "@testing-library/react-native";
import { ThemeProvider, useTheme } from "../../theme";
import { palettes } from "../../theme/tokens";
import { ThemeSelector } from "../../components/ThemeSelector";

// The phone's appearance, driven by the test: the real Appearance module talks to native code.
let mockSystemScheme: "light" | "dark" = "light";
const mockListeners = new Set<() => void>();
const mockSetColorScheme = jest.fn();

// React Native's Jest preset replaces useColorScheme with a constant "light"; this one follows the test.
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => {
  const { useSyncExternalStore } = require("react");
  return {
    __esModule: true,
    default: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          mockListeners.add(listener);
          return () => mockListeners.delete(listener);
        },
        () => mockSystemScheme
      ),
  };
});

jest.mock("react-native/Libraries/Utilities/Appearance", () => ({
  getColorScheme: () => mockSystemScheme,
  setColorScheme: (scheme: string) => mockSetColorScheme(scheme),
  addChangeListener: () => ({ remove: () => undefined }),
}));

async function setSystemScheme(next: "light" | "dark") {
  mockSystemScheme = next;
  await act(async () => mockListeners.forEach((listener) => listener()));
}

function Probe() {
  const { scheme, preference, isReady, colors } = useTheme();
  return <Text testID="probe">{`${isReady ? "ready" : "loading"}|${preference}|${scheme}|${colors.bg}`}</Text>;
}

async function renderThemed(children = <Probe />) {
  await render(<ThemeProvider>{children}</ThemeProvider>);
  // The saved choice is read from storage after the first render.
  await screen.findByText(/^ready\|/);
}

const probe = () => String(screen.getByTestId("probe").props.children);

beforeEach(() => {
  mockSystemScheme = "light";
  mockListeners.clear();
  mockSetColorScheme.mockClear();
});

describe("ThemeProvider", () => {
  it("starts on System and follows the phone: light now", async () => {
    await renderThemed();

    expect(probe()).toBe(`ready|system|light|${palettes.light.bg}`);
  });

  it("System follows the phone the moment it changes — light to dark and back", async () => {
    await renderThemed();

    await setSystemScheme("dark");
    expect(probe()).toBe(`ready|system|dark|${palettes.dark.bg}`);

    await setSystemScheme("light");
    expect(probe()).toBe(`ready|system|light|${palettes.light.bg}`);
  });

  it("an explicit Dark stays dark whatever the phone does, and is saved on the device", async () => {
    const user = userEvent.setup();
    await renderThemed(
      <>
        <Probe />
        <ThemeSelector />
      </>
    );

    await user.press(screen.getByRole("radio", { name: "Dark" }));
    expect(probe()).toBe(`ready|dark|dark|${palettes.dark.bg}`);
    expect(await AsyncStorage.getItem("wallex_theme")).toBe("dark");
    expect(mockSetColorScheme).toHaveBeenLastCalledWith("dark");

    await setSystemScheme("light");
    await setSystemScheme("dark");
    await setSystemScheme("light");
    expect(probe()).toBe(`ready|dark|dark|${palettes.dark.bg}`);
  });

  it("an explicit Light is not overridden by a dark phone", async () => {
    mockSystemScheme = "dark";
    const user = userEvent.setup();
    await renderThemed(
      <>
        <Probe />
        <ThemeSelector />
      </>
    );
    expect(probe()).toContain("|system|dark|");

    await user.press(screen.getByRole("radio", { name: "Light" }));

    expect(probe()).toBe(`ready|light|light|${palettes.light.bg}`);
    expect(mockSetColorScheme).toHaveBeenLastCalledWith("light");
  });

  it("going back to System hands the choice back to the phone", async () => {
    const user = userEvent.setup();
    await renderThemed(
      <>
        <Probe />
        <ThemeSelector />
      </>
    );
    await user.press(screen.getByRole("radio", { name: "Dark" }));

    await user.press(screen.getByRole("radio", { name: "System" }));

    expect(probe()).toBe(`ready|system|light|${palettes.light.bg}`);
    expect(mockSetColorScheme).toHaveBeenLastCalledWith("unspecified");
    expect(await AsyncStorage.getItem("wallex_theme")).toBe("system");
  });

  it("remembers the choice the next time the app starts", async () => {
    await AsyncStorage.setItem("wallex_theme", "dark");

    await renderThemed();

    expect(probe()).toBe(`ready|dark|dark|${palettes.dark.bg}`);
    expect(mockSetColorScheme).toHaveBeenCalledWith("dark");
  });

  it("ignores a saved value it doesn't know", async () => {
    await AsyncStorage.setItem("wallex_theme", "sepia");

    await renderThemed();

    expect(probe()).toContain("|system|light|");
  });

  it("shows which option is selected to screen readers", async () => {
    const user = userEvent.setup();
    await renderThemed(
      <>
        <Probe />
        <ThemeSelector />
      </>
    );
    expect(screen.getByLabelText("Theme")).toHaveProp("accessibilityRole", "radiogroup");
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();

    await user.press(screen.getByRole("radio", { name: "Light" }));

    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "System" })).not.toBeChecked();
  });
});

describe("useTheme without a provider", () => {
  it("falls back to the light theme instead of crashing (a component rendered on its own)", async () => {
    await render(<Probe />);

    expect(probe()).toBe(`ready|system|light|${palettes.light.bg}`);
  });
});
