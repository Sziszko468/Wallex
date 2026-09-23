import { StyleSheet, Text, View } from "react-native";
import type { Transaction } from "../../types/transaction";
import { formatCurrency, formatShortDate } from "../../utils/format";
import { colors, fontSize, spacing } from "../../utils/theme";

interface RecentTransactionsProps {
  transactions: Transaction[];
  colorByCategoryId: Map<number, string>;
  nameByCategoryId: Map<number, string>;
}

export function RecentTransactions({
  transactions,
  colorByCategoryId,
  nameByCategoryId,
}: RecentTransactionsProps) {
  if (transactions.length === 0) {
    return <Text style={styles.empty}>No transactions yet.</Text>;
  }

  return (
    <View>
      {transactions.map((transaction, index) => {
        const isIncome = transaction.type === "income";
        const categoryName = nameByCategoryId.get(transaction.category) ?? "Uncategorized";

        return (
          <View
            key={transaction.id}
            style={[styles.row, index === transactions.length - 1 && styles.rowLast]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: colorByCategoryId.get(transaction.category) ?? colors.primary },
              ]}
            />
            <View style={styles.details}>
              <Text style={styles.description} numberOfLines={1}>
                {transaction.description || categoryName}
              </Text>
              <Text style={styles.meta}>
                {categoryName} · {formatShortDate(transaction.date)}
              </Text>
            </View>
            <Text style={[styles.amount, isIncome ? styles.income : styles.expense]}>
              {isIncome ? "+" : "-"}
              {formatCurrency(transaction.amount)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  details: {
    flex: 1,
  },
  description: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: "600",
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  amount: {
    fontSize: fontSize.base,
    fontWeight: "700",
  },
  income: {
    color: colors.success,
  },
  expense: {
    color: colors.danger,
  },
});
