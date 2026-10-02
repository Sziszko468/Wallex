import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../i18n";
import { currencyName } from "./currency";
import {
  formatCurrency,
  formatDayHeading,
  formatMonthName,
  formatMonthYear,
  formatPercentage,
  formatRate,
  formatSignedPercentage,
  formatWeekdayName,
} from "./format";
import { greetingFor } from "./greeting";

describe("formatting in Hungarian", () => {
  beforeEach(() => i18n.changeLanguage("hu"));
  afterEach(() => i18n.changeLanguage("en"));

  it("uses a decimal comma for percentages", () => {
    expect(formatPercentage(14.3)).toBe("14,3%");
    expect(formatSignedPercentage(14.3)).toBe("+14,3%");
    expect(formatSignedPercentage(-5)).toBe("−5,0%");
    expect(formatSignedPercentage(0)).toBe("0,0%");
  });

  it("writes forints as whole numbers with the Ft sign", () => {
    const text = formatCurrency("15000.00", "HUF");
    expect(text).toMatch(/15\s?000/);
    expect(text).toContain("Ft");
    expect(text).not.toMatch(/,\d/);
  });

  it("uses a decimal comma for euros", () => {
    expect(formatCurrency("12.5", "EUR")).toMatch(/12,50/);
  });

  it("spells months and weekdays in Hungarian", () => {
    expect(formatMonthName(9)).toBe("szeptember");
    expect(formatMonthName(1, "short")).toMatch(/^jan/);
    expect(formatWeekdayName(1)).toBe("hétfő");
    expect(formatWeekdayName(7)).toBe("vasárnap");
    expect(formatMonthYear(2026, 9)).toMatch(/2026.*szeptember/);
  });

  it("names today and yesterday in Hungarian", () => {
    const now = new Date(2026, 8, 30, 15, 30);
    expect(formatDayHeading("2026-09-30", now)).toBe("Ma");
    expect(formatDayHeading("2026-09-29", now)).toBe("Tegnap");
  });

  it("spells the rate with a decimal comma", () => {
    expect(formatRate("0.002564")).toBe("0,002564");
  });

  it("names currencies in Hungarian", () => {
    expect(currencyName("HUF")).toBe("Magyar forint");
    expect(currencyName("EUR")).toBe("Euró");
  });

  it("greets in Hungarian", () => {
    expect(greetingFor(new Date(2026, 8, 30, 8))).toBe("Jó reggelt");
    expect(greetingFor(new Date(2026, 8, 30, 13))).toBe("Jó napot");
    expect(greetingFor(new Date(2026, 8, 30, 21))).toBe("Jó estét");
  });
});

describe("formatting in English", () => {
  it("uses a decimal point for percentages", () => {
    expect(formatPercentage(14.3)).toBe("14.3%");
    expect(formatSignedPercentage(-5)).toBe("−5.0%");
  });

  it("names the greeting by the hour", () => {
    expect(greetingFor(new Date(2026, 8, 30, 4))).toBe("Good evening");
    expect(greetingFor(new Date(2026, 8, 30, 5))).toBe("Good morning");
    expect(greetingFor(new Date(2026, 8, 30, 11, 59))).toBe("Good morning");
    expect(greetingFor(new Date(2026, 8, 30, 12))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 8, 30, 17, 59))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 8, 30, 18))).toBe("Good evening");
  });

  it("spells months and weekdays in English", () => {
    expect(formatMonthName(9)).toBe("September");
    expect(formatWeekdayName(1)).toBe("Monday");
    expect(formatWeekdayName(7)).toBe("Sunday");
  });

  it("names the currencies in English", () => {
    expect(currencyName("HUF")).toBe("Hungarian Forint");
  });
});
