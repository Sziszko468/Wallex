import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Category } from "../../types/category";
import type { RecurringTransaction } from "../../types/recurringTransaction";
import { formatCurrency, formatShortDate } from "../../utils/format";
import { colors, fontSize, radius, spacing } from "../../utils/theme";

const FREQUENCY_LABELS: Record<RecurringTransaction["frequency"], string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

interface RecurringTransactionCardProps {
  item: RecurringTransaction;
  category?: Category;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  isToggling: boolean;
}

export function RecurringTransactionCard({
  item,
  category,
  onEdit,
  onDelete,
  onToggleActive,
  isToggling,
}: RecurringTransactionCardProps) {
  const isIncome = item.type === "income";

  return (
    <View style={[styles.card, !item.is_active && styles.cardInactive]}>
      <View style={styles.header}>
        <View style={styles.nameRow}>
          {category && <View style={[styles.dot, { backgroundColor: category.color }]} />}
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <Text style={[styles.amount, isIncome ? styles.income : styles.expense]}>
          {isIncome ? "+" : "-"}
          {formatCurrency(item.amount)}
        </Text>
      </View>

      <Text style={styles.meta}>
        {category?.name ?? "Uncategorized"} · {FREQUENCY_LABELS[item.frequency]}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.nextOccurrence}>Next: {formatShortDate(item.next_occurrence_date)}</Text>
        <Text style={item.is_active ? styles.statusActive : styles.statusPaused}>
          {item.is_active ? "Active" : "Paused"}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.is_active ? "Pause" : "Resume"} ${item.name}`}
          onPress={onToggleActive}
          disabled={isToggling}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          {isToggling ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.actionText}>{item.is_active ? "Pause" : "Resume"}</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.name}`}
          onPress={onEdit}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
          onPress={onDelete}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardInactive: {
    opacity: 0.6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
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
  meta: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  nextOccurrence: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  statusActive: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.success,
  },
  statusPaused: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  actionText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.primary,
  },
  deleteText: {
    color: colors.danger,
  },
});
