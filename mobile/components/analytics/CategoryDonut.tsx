import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { makeStyles, space, useTheme } from "../../theme";
import type { Category } from "../../types/category";
import type { CategoryBreakdownEntry } from "../../types/dashboard";
import { categoryLook } from "../../utils/categoryStyle";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { CategoryDot } from "../ui/CategoryMark";
import { Text } from "../ui/Text";

interface CategoryDonutProps {
  categories: CategoryBreakdownEntry[];
  categoriesById: Map<number, Category>;
  /** The month's total expenses (the API's own figure), shown in the middle of the ring. */
  total: string | undefined;
}

const SIZE = 184;
const RADIUS = 38;
const STROKE = 13;
const FULL_CIRCLE = 2 * Math.PI * RADIUS;
/** A sliver between neighbouring segments, so they read as separate. */
const GAP = 1.4;
const FULL_PERCENT = 100;

const useStyles = makeStyles(({ colors }) => ({
  ringWrap: { alignSelf: "center", width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center", marginBottom: space[5] },
  center: { position: "absolute", alignItems: "center", paddingHorizontal: space[8] },
  list: { gap: space[1] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44 },
  name: { flex: 1 },
  divider: { height: 1, backgroundColor: colors.divider },
}));

/**
 * Where a month's money went: a ring with one segment per category (its own colour, the same as
 * everywhere else in the app) and the full list beneath. Segment sizes are the API's percentages.
 */
export function CategoryDonut({ categories, categoriesById, total }: CategoryDonutProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const baseCurrency = useBaseCurrency();

  let offset = 0;

  return (
    <View>
      <View style={styles.ringWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
          <G transform="rotate(-90 50 50)">
            <Circle cx={50} cy={50} r={RADIUS} fill="none" stroke={colors.bgSubtle} strokeWidth={STROKE} />
            {categories.map((entry) => {
              const length = (entry.percentage / FULL_PERCENT) * FULL_CIRCLE;
              const segment = (
                <Circle
                  key={entry.category_id}
                  cx={50}
                  cy={50}
                  r={RADIUS}
                  fill="none"
                  stroke={categoryLook(categoriesById.get(entry.category_id)?.color, scheme).tone}
                  strokeWidth={STROKE}
                  strokeDasharray={`${Math.max(0, length - GAP)} ${FULL_CIRCLE}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return segment;
            })}
          </G>
        </Svg>
        {total !== undefined ? (
          <View style={styles.center}>
            <Text variant="caption" color="textSecondary">
              {t("analytics.categories.total")}
            </Text>
            <Text variant="amountLarge" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {formatCurrency(total, baseCurrency)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.list}>
        {categories.map((entry, index) => (
          <View key={entry.category_id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View
              style={styles.row}
              accessible
              accessibilityLabel={`${entry.category_name}: ${formatCurrency(entry.amount, baseCurrency)}, ${t("analytics.categories.share", { percentage: formatPercentage(entry.percentage) })}`}
            >
              <CategoryDot color={categoriesById.get(entry.category_id)?.color} />
              <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                {entry.category_name}
              </Text>
              <Text variant="caption" color="textSecondary">
                {formatPercentage(entry.percentage)}
              </Text>
              <Text variant="amount" style={{ minWidth: 88, textAlign: "right" }} numberOfLines={1}>
                {formatCurrency(entry.amount, baseCurrency)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
