/* Native modules replaced with in-memory fakes for Jest (jest-expo runs tests as iOS). */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    // Plain functions (not jest.fn) so jest.resetAllMocks() in a test can't wipe the store's behaviour.
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void store.set(key, value),
    deleteItemAsync: async (key: string) => void store.delete(key),
    __store: store,
  };
});

// The real provider renders nothing until native layout reports the insets.
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

// The device's language: tests start in English whatever the machine running them is set to.
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en-US", languageCode: "en" }],
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => require("crypto").randomUUID(),
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })),
  getExpoPushTokenAsync: jest.fn(),
  useLastNotificationResponse: () => undefined,
  clearLastNotificationResponse: jest.fn(),
  DEFAULT_ACTION_IDENTIFIER: "default",
  AndroidImportance: { HIGH: 4 },
}));

// Fonts, the splash screen and the system UI colour are native: tests draw with the fallback font.
jest.mock("expo-font", () => ({ useFonts: () => [true, null], loadAsync: jest.fn(async () => undefined) }));
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn(async () => undefined) }));

// The first render of a screen builds the whole component tree, which can take a while on a busy machine.
jest.setTimeout(20000);

beforeEach(async () => {
  await require("../i18n").i18n.changeLanguage("en");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  require("expo-secure-store").__store.clear();
});
