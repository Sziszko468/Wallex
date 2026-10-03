import { View } from "react-native";
import { makeStyles, space } from "../theme";
import type { CurrencyCode } from "../types/currency";
import { CURRENCY_CODES } from "../utils/currency";
import { Chip } from "./ui/Chip";

interface CurrencyChipPickerProps {
  selected: CurrencyCode;
  onSelect: (currency: CurrencyCode) => void;
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
}));

/** One chip per supported currency — six options fit a wrapped row better than a dropdown. */
export function CurrencyChipPicker({ selected, onSelect }: CurrencyChipPickerProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {CURRENCY_CODES.map((code) => (
        <Chip key={code} label={code} isSelected={code === selected} onPress={() => onSelect(code)} />
      ))}
    </View>
  );
}
