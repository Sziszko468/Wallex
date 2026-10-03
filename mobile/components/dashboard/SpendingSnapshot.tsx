import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { makeStyles, radius, space, useTheme } from "../../theme";
import type { Category } from "../../types/category";
import type { CategoryBreakdownEntry } from "../../types/dashboard";
import { categoryLook } from "../../utils/categoryStyle";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { Card } from "../ui/Card";
import { CategoryDot } from "../ui/CategoryMark";
import { Text } from "../ui/Text";

/** The bar shows this many categories on their own; the rest share one neutral segment. */
const BAR_SEGMENTS = 4;
/** The list under the bar names the biggest few. */
const LEGEND_ROWS = 3;

interface SpendingSnapshotProps {
  categories: CategoryBreakdownEntry[];
  categoriesById: Map<number, Category>;
}

const useStyles = makeStyles(({ colors }) => ({
  bar: { flexDirection: "row", height: 12, gap: 2, borderRadius: radius.full, overflow: "hidden", backgroundColor: colors.bgSubtle },
  legend: { marginTop: space[4], gap: space[3] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  name: { flex: 1 },
}));

/**
 * One slim bar, one colour per category, and the top three named beneath it: the month's spending
 * in a glance. The full breakdown lives on the analytics screen.
 */
export function SpendingSnapshot({ categories, categoriesById }: SpendingSnapshotProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const baseCurrency = useBaseCurrency();

  if (categories.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        {t("dashboard.spending.empty")}
      </Text>
    );
  }

  const shown = categories.slice(0, BAR_SEGMENTS);
  // The rest of the bar: whatever the shown categories leave of 100%, taken from the API's own shares.
  const shownShare = shown.reduce((sum, entry) => sum + entry.percentage, 0);
  const restShare = Math.max(0, 100 - shownShare);

  return (
    <Card padding={4}>
      <View style={styles.bar} accessibilityRole="image" accessibilityLabel={t("dashboard.spending.barLabel")}>
        {shown.map((entry) => (
          <View
            key={entry.category_id}
            style={{ flex: entry.percentage, backgroundColor: categoryLook(categoriesById.get(entry.category_id)?.color, scheme).tone }}
          />
        ))}
        {restShare > 0 ? <View style={{ flex: restShare, backgroundColor: colors.chartNeutral }} /> : null}
      </View>

      <View style={styles.legend}>
        {categories.slice(0, LEGEND_ROWS).map((entry) => (
          <View key={entry.category_id} style={styles.row} accessible accessibilityLabel={`${entry.category_name}: ${formatCurrency(entry.amount, baseCurrency)}, ${t("dashboard.spending.share", { percentage: formatPercentage(entry.percentage) })}`}>
            <CategoryDot color={categoriesById.get(entry.category_id)?.color} />
            <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
              {entry.category_name}
            </Text>
            <Text variant="caption" color="textSecondary">
              {formatPercentage(entry.percentage)}
            </Text>
            <Text variant="amount" style={{ minWidth: 84, textAlign: "right" }} numberOfLines={1}>
              {formatCurrency(entry.amount, baseCurrency)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
