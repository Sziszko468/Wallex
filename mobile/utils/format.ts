// Pure display formatting only — every number here already comes fully
// computed from the backend. Nothing in this file sums, divides, or
// otherwise derives a new financial figure.

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: string | number): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  return currencyFormatter.format(numeric);
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Compact date for narrow list rows, e.g. "Sep 10" — the mobile equivalent of web's formatDate. */
export function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Full date with year, for single-item detail views. */
export function formatFullDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
