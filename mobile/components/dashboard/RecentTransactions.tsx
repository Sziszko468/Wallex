import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, space } from "../../theme";
import type { Category } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { TransactionListItem } from "../transactions/TransactionListItem";
import { Card } from "../ui/Card";
import { Text } from "../ui/Text";

/** The width of a category tile at its default size (see CategoryMark). */
const MARK_SIZE = 40;

interface RecentTransactionsProps {
  transactions: Transaction[];
  categoriesById: Map<number, Category>;
  onOpen: (transactionId: number) => void;
}

const useStyles = makeStyles(({ colors }) => ({
  // Starts under the text, not under the category tile: the tile's width plus its padding and gap.
  divider: { height: 1, marginLeft: space[4] + MARK_SIZE + space[3], backgroundColor: colors.divider },
}));

/** The latest few transactions as one list; "View all" (in the section header) opens the rest. */
export function RecentTransactions({ transactions, categoriesById, onOpen }: RecentTransactionsProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  if (transactions.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        {t("dashboard.recent.empty")}
      </Text>
    );
  }

  return (
    <Card padding={0}>
      {transactions.map((transaction, index) => (
        <View key={transaction.id}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <TransactionListItem
            transaction={transaction}
            category={categoriesById.get(transaction.category)}
            onPress={() => onOpen(transaction.id)}
          />
        </View>
      ))}
    </Card>
  );
}
