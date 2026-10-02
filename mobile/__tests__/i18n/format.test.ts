import { i18n } from "../../i18n";
import { formatCurrency, formatMonthName, formatMonthYear, formatPercentage } from "../../utils/format";
import { extractErrorMessage } from "../../utils/errors";

describe("formatting in Hungarian", () => {
  beforeEach(() => i18n.changeLanguage("hu"));

  it("uses a decimal comma for percentages and euros", () => {
    expect(formatPercentage(14.3)).toBe("14,3%");
    expect(formatCurrency("12.5", "EUR")).toMatch(/12,50/);
  });

  it("writes forints as whole numbers with the Ft sign", () => {
    const text = formatCurrency("15000.00", "HUF");
    expect(text).toMatch(/15\s?000/);
    expect(text).toContain("Ft");
    expect(text).not.toMatch(/,\d/);
  });

  it("spells months in Hungarian", () => {
    expect(formatMonthName(9)).toBe("szeptember");
    expect(formatMonthYear(2026, 9)).toMatch(/2026.*szeptember/);
  });

  it("answers generic errors in Hungarian", () => {
    expect(extractErrorMessage(new Error("boom"))).toBe("Valami hiba történt. Kérjük, próbáld újra.");
  });
});

describe("formatting in English", () => {
  it("uses a decimal point", () => {
    expect(formatPercentage(14.3)).toBe("14.3%");
    expect(formatCurrency("12.5", "EUR")).toMatch(/12\.50/);
  });

  it("spells months in English", () => {
    expect(formatMonthName(9)).toBe("September");
    expect(formatMonthName(1, "short")).toBe("Jan");
  });

  it("answers generic errors in English", () => {
    expect(extractErrorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
  });
});
