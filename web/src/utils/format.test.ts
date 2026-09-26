import { describe, expect, it } from "vitest";
import { formatCurrency } from "./format";
import { hasValidPrecision } from "./currency";

// Intl output depends on the locale; these tests pin the parts that don't: digits and decimals.
describe("formatCurrency", () => {
  it("shows cents for the euro, dollar, pound and franc", () => {
    expect(formatCurrency("12.5", "EUR")).toMatch(/12[.,]50/);
    expect(formatCurrency("12.5", "USD")).toMatch(/12[.,]50/);
    expect(formatCurrency("0.1", "GBP")).toMatch(/0[.,]10/);
    expect(formatCurrency("3", "CHF")).toMatch(/3[.,]00/);
  });

  it("shows whole forints and yen", () => {
    expect(formatCurrency("15000.00", "HUF")).toMatch(/15[\s.,]?000(?![.,]\d)/);
    expect(formatCurrency("1600", "JPY")).toMatch(/1[\s.,]?600(?![.,]\d)/);
  });

  it("puts the right currency on the amount", () => {
    expect(formatCurrency("1", "EUR")).toMatch(/€|EUR/);
    expect(formatCurrency("1", "HUF")).toMatch(/HUF|Ft/);
    expect(formatCurrency("1", "JPY")).toMatch(/¥|JPY/);
  });
});

describe("hasValidPrecision", () => {
  it("accepts only whole forints and yen, however they are written", () => {
    expect(hasValidPrecision("15000", "HUF")).toBe(true);
    expect(hasValidPrecision("15000.00", "HUF")).toBe(true);
    expect(hasValidPrecision("15000.5", "HUF")).toBe(false);
    expect(hasValidPrecision("100.1", "JPY")).toBe(false);
  });

  it("leaves two-decimal currencies to the input and the backend", () => {
    expect(hasValidPrecision("12.34", "EUR")).toBe(true);
  });
});
