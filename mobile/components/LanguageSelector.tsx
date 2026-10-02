import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../hooks/useLanguage";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from "../i18n/languages";
import { colors, fontSize, radius, spacing } from "../utils/theme";

/** English / Magyar. Each language is named in itself, so it can always be found. */
export function LanguageSelector() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t("common.language.label")}>
      {SUPPORTED_LANGUAGES.map((code) => {
        const isActive = code === language;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={LANGUAGE_NAMES[code]}
            onPress={() => setLanguage(code)}
            style={({ pressed }) => [styles.segment, isActive && styles.segmentActive, pressed && !isActive && styles.pressed]}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{LANGUAGE_NAMES[code]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  labelActive: {
    color: colors.surface,
  },
});
