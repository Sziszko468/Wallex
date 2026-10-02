import { currentLocale } from "../../i18n";

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

const compactFormatters = new Map<string, Intl.NumberFormat>();

/** "3.6K" instead of "3600" — axis labels only; the exact amounts are in tooltips and lists. */
export function compactNumber(value: number): string {
  const locale = currentLocale();
  let formatter = compactFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
    compactFormatters.set(locale, formatter);
  }
  return formatter.format(value);
}

/** Rounded top corners of every bar (top-left, top-right, bottom-right, bottom-left). */
const BAR_TOP_RADIUS = 6;
const BAR_BOTTOM_RADIUS = 2;
export const BAR_CORNER_RADIUS: [number, number, number, number] = [
  BAR_TOP_RADIUS,
  BAR_TOP_RADIUS,
  BAR_BOTTOM_RADIUS,
  BAR_BOTTOM_RADIUS,
];
