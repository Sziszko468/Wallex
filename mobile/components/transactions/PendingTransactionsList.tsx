import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { PendingTransaction } from "../../services/outbox";
import type { Category } from "../../types/category";
import { formatCurrency, formatShortDate } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

interface PendingTransactionsListProps {
  items: readonly PendingTransaction[];
  categoriesById: Map<number, Category>;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}

/**
 * Transactions recorded offline that the backend doesn't have yet. Shown
 * separately from the server list: they aren't part of any total until synced.
 */
export function PendingTransactionsList({ items, categoriesById, onRetry, onDiscard }: PendingTransactionsListProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t("transactions.pending.heading")}</Text>
      {items.map((item) => {
        const category = categoriesById.get(item.payload.category);
        const isIncome = item.payload.type === "income";
        const isFailed = item.status === "failed";
        return (
          <View key={item.client_id} style={[styles.card, isFailed && styles.cardFailed]}>
            <View style={styles.row}>
              <View style={styles.details}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.payload.description || category?.name || t("common.transaction")}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {category?.name ?? t("transactions.pending.category")} · {formatShortDate(item.payload.date)}
                </Text>
              </View>
              <Text style={styles.amount}>
                {isIncome ? "+" : "-"}
                {formatCurrency(item.payload.amount, item.payload.currency ?? baseCurrency)}
              </Text>
              <Text style={[styles.badge, isFailed ? styles.badgeFailed : styles.badgePending]}>
                {isFailed ? t("transactions.pending.failed") : t("transactions.pending.pending")}
              </Text>
            </View>

            {isFailed && (
              <>
                {item.last_error && <Text style={styles.error}>{item.last_error}</Text>}
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" onPress={() => onRetry(item.client_id)} hitSlop={8}>
                    <Text style={styles.actionText}>{t("transactions.pending.retry")}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => onDiscard(item.client_id)} hitSlop={8}>
                    <Text style={[styles.actionText, styles.discard]}>{t("transactions.pending.discard")}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  heading: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardFailed: {
    borderColor: colors.danger,
    borderStyle: "solid",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
    color: colors.textMuted,
  },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  badgePending: {
    color: colors.warning,
    backgroundColor: "rgba(217, 119, 6, 0.12)",
  },
  badgeFailed: {
    color: colors.danger,
    backgroundColor: "rgba(220, 38, 38, 0.1)",
  },
  error: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.primary,
    minHeight: 32,
    textAlignVertical: "center",
  },
  discard: {
    color: colors.danger,
  },
});
