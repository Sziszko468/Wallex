import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { formatCurrency, formatShortDate } from "../../utils/format";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

interface TransactionListItemProps {
  transaction: Transaction;
  category?: Category;
  onPress: () => void;
}

export function TransactionListItem({ transaction, category, onPress }: TransactionListItemProps) {
  const isIncome = transaction.type === "income";
  const title = transaction.description || category?.name || "Transaction";
  const amountLabel = `${isIncome ? "+" : "-"}${formatCurrency(transaction.amount)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${category?.name ?? "Uncategorized"}, ${formatShortDate(
        transaction.date
      )}, ${amountLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.dot, { backgroundColor: category?.color ?? colors.primary }]} />
      <View style={styles.details}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {category?.name ?? "Uncategorized"} · {formatShortDate(transaction.date)}
        </Text>
      </View>
      <Text style={[styles.amount, isIncome ? styles.income : styles.expense]}>{amountLabel}</Text>
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
  amount: {
    fontSize: fontSize.base,
    fontWeight: "700",
    flexShrink: 0,
  },
  income: {
    color: colors.success,
  },
  expense: {
    color: colors.danger,
  },
});
