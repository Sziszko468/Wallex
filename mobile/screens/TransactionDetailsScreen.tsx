import { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { listCategories } from "../services/categoriesService";
import { deleteTransaction, getTransaction } from "../services/transactionsService";
import { extractErrorMessage, isConflict, isNotFound } from "../utils/errors";
import { formatCurrency, formatFullDate } from "../utils/format";
import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { SectionState } from "../components/SectionState";
import { colors, fontSize, radius, spacing } from "../utils/theme";

export function TransactionDetailsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const transactionId = Number(id);
  const baseCurrency = useBaseCurrency();
  const [isDeleting, setIsDeleting] = useState(false);

  const transaction = useAsyncData(
    useCallback(() => getTransaction(transactionId), [transactionId])
  );
  const categories = useAsyncData(useCallback(() => listCategories(), []));

  // Back from Edit: show the saved change.
  useRefetchOnFocus(transaction.refetch);

  const category = categories.data?.find((item) => item.id === transaction.data?.category);

  function handleEdit() {
    router.push(`/edit-transaction/${transactionId}`);
  }

  function handleDeletePress() {
    const label = transaction.data?.description || category?.name || t("transactions.details.thisTransaction");
    Alert.alert(t("transactions.details.deleteTitle"), t("common.confirm.deleteMessage", { name: label }), [
      { text: t("common.actions.cancel"), style: "cancel" },
      { text: t("common.actions.delete"), style: "destructive", onPress: confirmDelete },
    ]);
  }

  async function confirmDelete() {
    setIsDeleting(true);
    try {
      // Only the version on screen may be deleted: a change made meanwhile on another device wins.
      await deleteTransaction(transactionId, transaction.data?.updated_at);
      // The transactions list refetches on focus once we land back on it.
      router.back();
    } catch (error) {
      if (isNotFound(error)) {
        router.back(); // already deleted on another device: nothing left to do
        return;
      }
      setIsDeleting(false);
      if (isConflict(error)) {
        Alert.alert(t("transactions.details.conflictTitle"), t("transactions.details.conflictMessage"));
        void transaction.revalidate();
        return;
      }
      Alert.alert(t("transactions.details.couldntDelete"), extractErrorMessage(error));
    }
  }

  return (
    <Screen scroll>
      <SectionState
        isLoading={transaction.isLoading || categories.isLoading}
        error={transaction.error ?? categories.error}
        onRetry={() => {
          transaction.refetch();
          categories.refetch();
        }}
      >
        {transaction.data && (
          <View>
            <View style={styles.hero}>
              {category && (
                <View style={styles.categoryRow}>
                  <View style={[styles.dot, { backgroundColor: category.color }]} />
                  <Text style={styles.categoryName}>{category.name}</Text>
                </View>
              )}
              <Text
                style={[
                  styles.amount,
                  transaction.data.type === "income" ? styles.income : styles.expense,
                ]}
              >
                {transaction.data.type === "income" ? "+" : "-"}
                {formatCurrency(transaction.data.amount, transaction.data.currency)}
              </Text>
            </View>

            <View style={styles.card}>
              <DetailRow
                label={t("transactions.details.description")}
                value={transaction.data.description || t("common.states.notAvailable")}
              />
              <DetailRow label={t("transactions.details.date")} value={formatFullDate(transaction.data.date)} />
              {transaction.data.currency !== baseCurrency && (
                // Computed by the API with the ECB rate of the transaction's date.
                <DetailRow
                  label={t("transactions.details.inCurrency", { currency: baseCurrency })}
                  value={formatCurrency(transaction.data.base_amount, baseCurrency)}
                />
              )}
              <DetailRow
                label={t("transactions.details.type")}
                value={transaction.data.type === "income" ? t("common.transactionType.income") : t("common.transactionType.expense")}
              />
            </View>

            <View style={styles.actions}>
              <View style={styles.actionButton}>
                <Button title={t("common.actions.edit")} variant="secondary" onPress={handleEdit} />
              </View>
              <View style={styles.actionButton}>
                <Button
                  title={t("common.actions.delete")}
                  variant="danger"
                  onPress={handleDeletePress}
                  isLoading={isDeleting}
                />
              </View>
            </View>
          </View>
        )}
      </SectionState>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryName: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    fontWeight: "600",
  },
  amount: {
    fontSize: 40,
    fontWeight: "800",
  },
  income: {
    color: colors.success,
  },
  expense: {
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  rowValue: {
    color: colors.text,
    fontWeight: "600",
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
