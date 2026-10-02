import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { formatCurrency, formatShortDate } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

interface TransactionListItemProps {
  transaction: Transaction;
  category?: Category;
  onPress: () => void;
}

export function TransactionListItem({ transaction, category, onPress }: TransactionListItemProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  const isIncome = transaction.type === "income";
  const title = transaction.description || category?.name || t("common.transaction");
  const categoryName = category?.name ?? t("common.uncategorized");
  const amountLabel = `${isIncome ? "+" : "-"}${formatCurrency(transaction.amount, transaction.currency)}`;
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
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.dot, { backgroundColor: category?.color ?? colors.primary }]} />
      <View style={styles.details}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {categoryName} · {formatShortDate(transaction.date)}
        </Text>
      </View>
      <View style={styles.amounts}>
        <Text style={[styles.amount, isIncome ? styles.income : styles.expense]}>{amountLabel}</Text>
        {convertedLabel && <Text style={styles.converted}>{convertedLabel}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 64,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  details: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  amounts: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  amount: {
    fontSize: fontSize.base,
    fontWeight: "700",
  },
  converted: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  income: {
    color: colors.success,
  },
  expense: {
    color: colors.danger,
  },
});
