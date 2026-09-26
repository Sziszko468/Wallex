import { renderHook } from "@testing-library/react-native";
import { useFocusEffect } from "expo-router";
import { useRefetchOnFocus } from "../../hooks/useRefetchOnFocus";

jest.mock("expo-router", () => ({ useFocusEffect: jest.fn() }));

const mockedUseFocusEffect = useFocusEffect as jest.Mock;

/** Simulates the screen gaining focus: runs the effect most recently passed to useFocusEffect. */
function focus(): void {
  const effect = mockedUseFocusEffect.mock.calls.at(-1)?.[0] as () => void;
  effect();
}

type Props = { refetch: () => void };

beforeEach(() => mockedUseFocusEffect.mockClear());

it("skips the first focus: mounting already loads the data", async () => {
  const refetch = jest.fn();
  await renderHook((props: Props) => useRefetchOnFocus(props.refetch), { initialProps: { refetch } });

  focus();

  expect(refetch).not.toHaveBeenCalled();
});

it("refetches with the latest callback — the screen's current filters, not the ones from the first render", async () => {
  const withInitialFilters = jest.fn();
  const withCurrentFilters = jest.fn();
  const { rerender } = await renderHook((props: Props) => useRefetchOnFocus(props.refetch), {
    initialProps: { refetch: withInitialFilters },
  });
  focus(); // initial mount

  await rerender({ refetch: withCurrentFilters }); // e.g. the user picked a category filter
  focus(); // back from a transaction's details screen

  expect(withCurrentFilters).toHaveBeenCalledTimes(1);
  expect(withInitialFilters).not.toHaveBeenCalled();
});

it("keeps one stable focus effect, so a changed dependency (e.g. the month) doesn't trigger a second fetch", async () => {
  const { rerender } = await renderHook((props: Props) => useRefetchOnFocus(props.refetch), {
    initialProps: { refetch: jest.fn() },
  });
  await rerender({ refetch: jest.fn() });

  const effects = new Set(mockedUseFocusEffect.mock.calls.map(([effect]) => effect));
  expect(effects.size).toBe(1);
});
