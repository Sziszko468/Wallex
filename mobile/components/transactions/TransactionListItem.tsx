import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { makeStyles, space, useTheme } from "../../theme";
import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { formatCurrency, formatShortDate, formatSignedAmount } from "../../utils/format";
import { CategoryMark } from "../ui/CategoryMark";
import { Text } from "../ui/Text";

interface TransactionListItemProps {
  transaction: Transaction;
  category?: Category;
  onPress: () => void;
  /** The date is left out where a day heading already says it (the grouped transactions list). */
  showDate?: boolean;
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 68, paddingHorizontal: space[4], paddingVertical: space[3] },
  pressed: { backgroundColor: colors.surfaceSubtle },
  text: { flex: 1, gap: 2 },
  amounts: { alignItems: "flex-end", flexShrink: 0, gap: 2 },
}));

/**
 * One transaction, readable at a glance: what, where it belongs, how much. The amount carries its
 * direction as a sign ("−€12.50" out, "+€3,000.00" in); colour only backs the sign up. A foreign
 * currency amount shows its worth in the base currency beneath it.
 */
function TransactionListItemView({ transaction, category, onPress, showDate = true }: TransactionListItemProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const baseCurrency = useBaseCurrency();
  const isIncome = transaction.type === "income";
  const title = transaction.description || category?.name || t("common.transaction");
  const categoryName = category?.name ?? t("common.uncategorized");
  const amountLabel = formatSignedAmount(transaction.type, transaction.amount, transaction.currency);
  // A foreign-currency transaction also shows its value in the base currency (computed by the API).
  const convertedLabel =
    transaction.currency !== baseCurrency ? `≈ ${formatCurrency(transaction.base_amount, baseCurrency)}` : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(convertedLabel ? "transactions.itemLabelConverted" : "transactions.itemLabel", {
        title,
        category: categoryName,
        date: formatShortDate(transaction.date),
        amount: amountLabel,
        converted: convertedLabel ?? "",
      })}
      onPress={onPress}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <CategoryMark category={category} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {showDate ? `${categoryName} · ${formatShortDate(transaction.date)}` : categoryName}
        </Text>
      </View>
      <View style={styles.amounts}>
        <Text variant="amount" color={isIncome ? "success" : "text"} numberOfLines={1}>
          {amountLabel}
        </Text>
        {convertedLabel ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {convertedLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const TransactionListItem = memo(TransactionListItemView);
