import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { makeStyles, radius, space } from "../../theme";
import type { PendingTransaction } from "../../services/outbox";
import type { Category } from "../../types/category";
import { formatShortDate, formatSignedAmount } from "../../utils/format";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CategoryMark } from "../ui/CategoryMark";
import { Text } from "../ui/Text";

interface PendingTransactionsListProps {
  items: readonly PendingTransaction[];
  categoriesById: Map<number, Category>;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: space[2], marginBottom: space[4] },
  card: {
    gap: space[3],
    padding: space[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  cardFailed: { borderStyle: "solid", borderColor: colors.danger },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  text: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", gap: space[2] },
  action: { flex: 1 },
}));

/**
 * Transactions recorded offline that the backend doesn't have yet. Shown separately from the
 * server list: they aren't part of any total until synced.
 */
export function PendingTransactionsList({ items, categoriesById, onRetry, onDiscard }: PendingTransactionsListProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const baseCurrency = useBaseCurrency();
  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="label" color="textSecondary">
        {t("transactions.pending.heading")}
      </Text>
      {items.map((item) => {
        const category = categoriesById.get(item.payload.category);
        const isFailed = item.status === "failed";
        return (
          <View key={item.client_id} style={[styles.card, isFailed && styles.cardFailed]}>
            <View style={styles.row}>
              <CategoryMark category={category} />
              <View style={styles.text}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {item.payload.description || category?.name || t("common.transaction")}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {category?.name ?? t("transactions.pending.category")} · {formatShortDate(item.payload.date)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: space[1] }}>
                <Text variant="amount" color="textSecondary" numberOfLines={1}>
                  {formatSignedAmount(item.payload.type, item.payload.amount, item.payload.currency ?? baseCurrency)}
                </Text>
                <Badge
                  label={isFailed ? t("transactions.pending.failed") : t("transactions.pending.pending")}
                  tone={isFailed ? "danger" : "warning"}
                  icon={isFailed ? "alert-circle" : "clock"}
                />
              </View>
            </View>

            {isFailed ? (
              <>
                {item.last_error ? (
                  <Text variant="caption" color="danger">
                    {item.last_error}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <View style={styles.action}>
                    <Button title={t("transactions.pending.retry")} variant="secondary" onPress={() => onRetry(item.client_id)} />
                  </View>
                  <View style={styles.action}>
                    <Button title={t("transactions.pending.discard")} variant="dangerSoft" onPress={() => onDiscard(item.client_id)} />
                  </View>
                </View>
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
