import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { detectDeviceLanguage, isLanguage, languageFromTag, pickSupportedLanguage } from "../../i18n/languages";
import { readStoredLanguage, storeLanguage } from "../../utils/languageStorage";

jest.mock("expo-localization", () => ({ getLocales: jest.fn(() => [{ languageTag: "en-US" }]) }));
const mockGetLocales = jest.mocked(Localization.getLocales);

function deviceLanguages(...tags: string[]) {
  mockGetLocales.mockReturnValue(tags.map((languageTag) => ({ languageTag })) as ReturnType<typeof Localization.getLocales>);
}

describe("languageFromTag", () => {
  it("maps regional tags to our languages", () => {
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
  it("takes the first preferred language we offer, in the device's order", () => {
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
    expect(isLanguage("de")).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });
});

describe("detectDeviceLanguage", () => {
  it("follows the device's language", () => {
    deviceLanguages("de-DE", "hu-HU");
    expect(detectDeviceLanguage()).toBe("hu");
  });

  it("falls back to English", () => {
    deviceLanguages("fr-FR");
    expect(detectDeviceLanguage()).toBe("en");
    deviceLanguages();
    expect(detectDeviceLanguage()).toBe("en");
  });
});

describe("stored language", () => {
  it("is remembered between launches", async () => {
    expect(await readStoredLanguage()).toBeNull();
    await storeLanguage("hu");
    expect(await readStoredLanguage()).toBe("hu");
  });

  it("ignores a stored value that is not a language", async () => {
    await AsyncStorage.setItem("wallex_language", "klingon");
    expect(await readStoredLanguage()).toBeNull();
  });

  it("survives unreadable storage", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    expect(await readStoredLanguage()).toBeNull();
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk"));
    await expect(storeLanguage("hu")).resolves.toBeUndefined();
  });
});
