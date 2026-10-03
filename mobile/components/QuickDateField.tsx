import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, space } from "../theme";
import { toIsoDate } from "../utils/date";
import { Chip } from "./ui/Chip";
import { TextField } from "./ui/TextField";

interface QuickDateFieldProps {
  value: string;
  onChange: (isoDate: string) => void;
  error?: string;
  /** Replaces the default "Date" label (the recurring form says "Start date"). */
  label?: string;
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toIsoDate(date);
}

const useStyles = makeStyles(() => ({
  chips: { flexDirection: "row", gap: space[2], marginBottom: space[3] },
}));

/**
 * Defaults to today; "Today" / "Yesterday" cover the common case in one tap, the text field
 * below covers everything else without a native date-picker dependency.
 */
export function QuickDateField({ value, onChange, error, label }: QuickDateFieldProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const today = daysAgoIso(0);
  const yesterday = daysAgoIso(1);

  return (
    <View>
      <View style={styles.chips}>
        <Chip label={t("common.dates.today")} isSelected={value === today} onPress={() => onChange(today)} />
        <Chip label={t("common.dates.yesterday")} isSelected={value === yesterday} onPress={() => onChange(yesterday)} />
      </View>
      <TextField
        label={label ?? t("common.form.date")}
        placeholder={t("common.form.datePlaceholder")}
        value={value}
        onChangeText={onChange}
        error={error}
        autoCapitalize="none"
        maxLength={10}
      />
    </View>
  );
}
