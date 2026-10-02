import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { CategoryBreakdownEntry } from "../../types/dashboard";
import { FULL_PERCENT } from "../../config/budget";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { colors, fontSize, spacing } from "../../utils/theme";

interface TopCategoriesProps {
  categories: CategoryBreakdownEntry[];
  colorByCategoryId: Map<number, string>;
}

const MAX_ITEMS = 5;

export function TopCategories({ categories, colorByCategoryId }: TopCategoriesProps) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();
  if (categories.length === 0) {
    return <Text style={styles.empty}>{t("dashboard.topCategories.empty")}</Text>;
  }

  return (
    <View>
      {categories.slice(0, MAX_ITEMS).map((entry) => (
        <View key={entry.category_id} style={styles.item}>
          <View style={styles.itemHeader}>
            <View style={styles.nameRow}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: colorByCategoryId.get(entry.category_id) ?? colors.primary },
                ]}
              />
              <Text style={styles.name} numberOfLines={1}>
                {entry.category_name}
              </Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(entry.amount, baseCurrency)}</Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(FULL_PERCENT, entry.percentage)}%`,
                  backgroundColor: colorByCategoryId.get(entry.category_id) ?? colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.percentage}>
            {t("dashboard.topCategories.share", { percentage: formatPercentage(entry.percentage) })}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  item: {
    marginBottom: spacing.sm,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
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
    color: colors.text,
    fontWeight: "600",
    flexShrink: 1,
  },
  amount: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: "700",
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
  percentage: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
});
