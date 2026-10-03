import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, space } from "../theme";
import { formatMonthYear } from "../utils/format";
import { IconButton } from "./ui/IconButton";
import { Text } from "./ui/Text";

interface MonthSelectorProps {
  year: number;
  month: number;
  onPrevious: () => void;
  onNext: () => void;
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space[4] },
}));

/** ‹ September 2026 › — the month the whole screen is about; both arrows sit under the thumb. */
export function MonthSelector({ year, month, onPrevious, onNext }: MonthSelectorProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <IconButton icon="chevron-left" variant="outlined" accessibilityLabel={t("common.month.previous")} onPress={onPrevious} />
      <Text variant="subheading" accessibilityLiveRegion="polite">
        {formatMonthYear(year, month)}
      </Text>
      <IconButton icon="chevron-right" variant="outlined" accessibilityLabel={t("common.month.next")} onPress={onNext} />
    </View>
  );
}
