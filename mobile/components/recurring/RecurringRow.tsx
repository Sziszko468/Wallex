import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, space, useTheme } from "../../theme";
import type { Category } from "../../types/category";
import type { RecurringTransaction } from "../../types/recurringTransaction";
import { formatShortDate, formatSignedAmount } from "../../utils/format";
import { Badge } from "../ui/Badge";
import { CategoryMark } from "../ui/CategoryMark";
import { Text } from "../ui/Text";

interface RecurringRowProps {
  item: RecurringTransaction;
  category?: Category;
  onPress: () => void;
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 72, paddingHorizontal: space[4], paddingVertical: space[3] },
  pressed: { backgroundColor: colors.surfaceSubtle },
  text: { flex: 1, gap: 2 },
  amounts: { alignItems: "flex-end", gap: space[1] },
}));

/**
 * One recurring transaction: what it is, how often, when it is next due, and how much. Tapping it
 * opens its actions (pause, edit, delete). A paused one is dimmed and says so in words.
 */
function RecurringRowView({ item, category, onPress }: RecurringRowProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const amountLabel = formatSignedAmount(item.type, item.amount, item.currency);
  const meta = `${t(`recurring.frequency.${item.frequency}`)} · ${t("recurring.next", { date: formatShortDate(item.next_occurrence_date) })}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${category?.name ?? t("common.uncategorized")}, ${meta}, ${amountLabel}, ${item.is_active ? t("recurring.active") : t("recurring.paused")}`}
      onPress={onPress}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, !item.is_active && { opacity: 0.7 }]}
    >
      <CategoryMark category={category} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.amounts}>
        <Text variant="amount" color={item.type === "income" ? "success" : "text"} numberOfLines={1}>
          {amountLabel}
        </Text>
        {item.is_active ? null : <Badge label={t("recurring.paused")} tone="neutral" icon="pause" />}
      </View>
    </Pressable>
  );
}

export const RecurringRow = memo(RecurringRowView);
