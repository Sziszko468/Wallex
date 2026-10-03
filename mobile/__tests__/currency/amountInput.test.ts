import { hasValidPrecision, normalizeAmountInput } from "../../utils/currency";

describe("normalizeAmountInput", () => {
  it.each([
    ["1250.50", "1250.50"],
    ["1250,50", "1250.50"], // a Hungarian number pad has a decimal comma
    ["1 250,50", "1250.50"], // digits grouped with a space
    ["1 250,50", "1250.50"], // ... or a non-breaking space
    ["  45,9  ", "45.9"],
    ["15000", "15000"],
    ["", ""],
    ["   ", ""],
  ])("%j becomes %j", (typed, expected) => {
    expect(normalizeAmountInput(typed)).toBe(expected);
  });

  it("leaves an ambiguous mix of comma and dot alone, so validation refuses it instead of guessing", () => {
    expect(normalizeAmountInput("1,250.50")).toBe("1,250.50");
    expect(Number(normalizeAmountInput("1,250.50"))).toBeNaN();
  });

  it("keeps the whole-number rule of forint working on a typed comma", () => {
    expect(hasValidPrecision(normalizeAmountInput("1500,50"), "HUF")).toBe(false);
    expect(hasValidPrecision(normalizeAmountInput("1500,00"), "HUF")).toBe(true);
  });
});
