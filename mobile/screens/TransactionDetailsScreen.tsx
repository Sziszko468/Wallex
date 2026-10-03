import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { listCategories } from "../services/categoriesService";
import { deleteTransaction, getTransaction } from "../services/transactionsService";
import { makeStyles, space } from "../theme";
import { extractErrorMessage, isConflict, isNotFound } from "../utils/errors";
import { formatCurrency, formatFullDate, formatSignedAmount } from "../utils/format";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CategoryMark } from "../components/ui/CategoryMark";
import { Skeleton } from "../components/ui/Skeleton";
import { Text } from "../components/ui/Text";

const useStyles = makeStyles(({ colors }) => ({
  hero: { alignItems: "center", gap: space[2], paddingTop: space[4], paddingBottom: space[6] },
  heroTitle: { marginTop: space[2] },
  rows: { gap: 0 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space[4], paddingVertical: space[3] },
  rowDivider: { height: 1, backgroundColor: colors.divider },
  actions: { flexDirection: "row", gap: space[3] },
  action: { flex: 1 },
}));

export function TransactionDetailsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const transactionId = Number(id);
  const baseCurrency = useBaseCurrency();
  const [isDeleting, setIsDeleting] = useState(false);

  const transaction = useAsyncData(useCallback(() => getTransaction(transactionId), [transactionId]));
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

  const data = transaction.data;
  const details: { label: string; value: string }[] = data
    ? [
        { label: t("transactions.details.description"), value: data.description || t("common.states.notAvailable") },
        { label: t("transactions.details.category"), value: category?.name ?? t("common.uncategorized") },
        { label: t("transactions.details.date"), value: formatFullDate(data.date) },
        // Computed by the API with the ECB rate of the transaction's date.
        ...(data.currency !== baseCurrency
          ? [{ label: t("transactions.details.inCurrency", { currency: baseCurrency }), value: formatCurrency(data.base_amount, baseCurrency) }]
          : []),
        { label: t("transactions.details.type"), value: data.type === "income" ? t("common.transactionType.income") : t("common.transactionType.expense") },
      ]
    : [];

  return (
    <Screen
      scroll
      footer={
        data ? (
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button title={t("common.actions.edit")} variant="secondary" icon="pencil" onPress={handleEdit} />
            </View>
            <View style={styles.action}>
              <Button title={t("common.actions.delete")} variant="dangerSoft" icon="trash" onPress={handleDeletePress} isLoading={isDeleting} />
            </View>
          </View>
        ) : undefined
      }
    >
      <SectionState
        isLoading={transaction.isLoading || categories.isLoading}
        error={transaction.error ?? categories.error}
        onRetry={() => {
          void transaction.refetch();
          void categories.refetch();
        }}
        skeleton={<Skeleton height={260} />}
      >
        {data ? (
          <View>
            <View style={styles.hero}>
              <CategoryMark category={category} size="lg" />
              <Text variant="caption" color="textSecondary" style={styles.heroTitle}>
                {category?.name ?? t("common.uncategorized")}
              </Text>
              <Text variant="amountHero" color={data.type === "income" ? "success" : "text"} numberOfLines={1} adjustsFontSizeToFit>
                {formatSignedAmount(data.type, data.amount, data.currency)}
              </Text>
            </View>

            <Card padding={4}>
              <View style={styles.rows}>
                {details.map((detail, index) => (
                  <View key={detail.label}>
                    {index > 0 ? <View style={styles.rowDivider} /> : null}
                    <View style={styles.row} accessible accessibilityLabel={`${detail.label}: ${detail.value}`}>
                      <Text variant="body" color="textSecondary">
                        {detail.label}
                      </Text>
                      <Text variant="bodyStrong" style={{ flexShrink: 1, textAlign: "right" }}>
                        {detail.value}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}
      </SectionState>
    </Screen>
  );
}
