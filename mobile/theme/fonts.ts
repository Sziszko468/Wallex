// Plus Jakarta Sans, the face the web app uses. Each weight is imported from its own sub-path so
// the bundle carries only the five weights the app draws with (the package root would pull in all
// fourteen files, italics included).
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";
import { fontFamilies } from "./tokens";

/** The map handed to expo-font's useFonts (see app/_layout.tsx). */
export const fontAssets = {
  [fontFamilies.regular]: PlusJakartaSans_400Regular,
  [fontFamilies.medium]: PlusJakartaSans_500Medium,
  [fontFamilies.semibold]: PlusJakartaSans_600SemiBold,
  [fontFamilies.bold]: PlusJakartaSans_700Bold,
  [fontFamilies.extrabold]: PlusJakartaSans_800ExtraBold,
};
