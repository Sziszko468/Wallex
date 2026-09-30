/**
 * Shared chart styling. Every colour is a design token, so charts follow the active theme
 * (and its contrast guarantees) automatically — no chart has its own hex codes.
 */
export const CHART_COLORS = {
  income: "var(--chart-income)",
  expense: "var(--chart-expense)",
  savings: "var(--chart-savings)",
  neutral: "var(--chart-neutral)",
  grid: "var(--chart-grid)",
  cursor: "var(--chart-cursor)",
} as const;

export const AXIS_TICK = { fill: "var(--chart-axis)", fontSize: 12 } as const;

const compactFormatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/** "3.6K" instead of "3600" — axis labels only; the exact amounts are in tooltips and lists. */
export function compactNumber(value: number): string {
  return compactFormatter.format(value);
}
