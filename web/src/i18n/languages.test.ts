import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  detectLanguage,
  isLanguage,
  languageFromTag,
  pickSupportedLanguage,
  readStoredLanguage,
  storeLanguage,
} from "./languages";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("languageFromTag", () => {
  it("maps regional browser tags to our languages", () => {
    expect(languageFromTag("hu-HU")).toBe("hu");
    expect(languageFromTag("hu")).toBe("hu");
    expect(languageFromTag("en-GB")).toBe("en");
    expect(languageFromTag("EN-us")).toBe("en");
  });

  it("returns null for a language we don't offer", () => {
    expect(languageFromTag("de-DE")).toBeNull();
    expect(languageFromTag("")).toBeNull();
  });
});

describe("pickSupportedLanguage", () => {
  it("takes the first preferred language we offer, in the browser's order", () => {
    expect(pickSupportedLanguage(["de-DE", "hu-HU", "en-US"])).toBe("hu");
    expect(pickSupportedLanguage(["en-US", "hu"])).toBe("en");
  });

  it("returns null when none is offered", () => {
    expect(pickSupportedLanguage(["de", "fr-FR"])).toBeNull();
    expect(pickSupportedLanguage([])).toBeNull();
  });
});

describe("isLanguage", () => {
  it("accepts only supported codes", () => {
    expect(isLanguage("hu")).toBe(true);
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("de")).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});

describe("stored language", () => {
  it("is remembered between visits", () => {
    expect(readStoredLanguage()).toBeNull();
    storeLanguage("hu");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("hu");
    expect(readStoredLanguage()).toBe("hu");
  });

  it("ignores a stored value that is not a language", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "klingon");
    expect(readStoredLanguage()).toBeNull();
  });

  it("survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredLanguage()).toBeNull();
    expect(() => storeLanguage("hu")).not.toThrow();
  });
});

describe("detectLanguage", () => {
  it("prefers the saved choice over the browser's language", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["hu-HU"]);
    storeLanguage("en");
    expect(detectLanguage()).toBe("en");
  });

  it("falls back to the browser's language", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE", "hu-HU"]);
    expect(detectLanguage()).toBe("hu");
  });

  it("falls back to English when nothing matches", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR"]);
    expect(detectLanguage()).toBe(DEFAULT_LANGUAGE);
  });
});
