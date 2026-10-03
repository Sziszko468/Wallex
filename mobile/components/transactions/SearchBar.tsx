import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { fontFamilies, layout, makeStyles, radius, space, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import { IconButton } from "../ui/IconButton";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    minHeight: layout.controlHeight,
    paddingLeft: space[4],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, paddingVertical: space[2], color: colors.text, fontFamily: fontFamilies.regular, fontSize: 16 },
}));

/** The search field that opens under the header: a magnifier, the text, and a clear button once there is text. */
export function SearchBar({ value, onChangeText, placeholder, autoFocus = false }: SearchBarProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const label = placeholder ?? t("transactions.search");

  return (
    <View style={styles.container}>
      <Icon name="search" size={20} color={colors.textSecondary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.primary}
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
        maxFontSizeMultiplier={1.4}
      />
      {value.length > 0 ? (
        <IconButton icon="x" iconSize={18} iconColor="textSecondary" accessibilityLabel={t("transactions.clearSearch")} onPress={() => onChangeText("")} />
      ) : (
        <View style={{ width: space[3] }} />
      )}
    </View>
  );
}
