import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { BUDGET_NEAR_LIMIT_PERCENT, FULL_PERCENT } from "../../config/budget";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { makeStyles, space, useTheme } from "../../theme";
import type { Category } from "../../types/category";
import { formatCurrency, formatPercentage } from "../../utils/format";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Badge, type BadgeTone } from "../ui/Badge";
import { CategoryMark } from "../ui/CategoryMark";
import { ProgressBar, type ProgressTone } from "../ui/ProgressBar";
import { Text } from "../ui/Text";

export type BudgetState = "onTrack" | "nearLimit" | "over";

/** A budget counts as near its limit from 80% used, and over it above 100% — the backend's own thresholds. */
export function budgetStateOf(usagePercentage: number): BudgetState {
  if (usagePercentage > FULL_PERCENT) return "over";
  return usagePercentage >= BUDGET_NEAR_LIMIT_PERCENT ? "nearLimit" : "onTrack";
}

const STATE_STYLE: Record<BudgetState, { tone: BadgeTone; icon: IconName; bar: ProgressTone }> = {
  onTrack: { tone: "success", icon: "check", bar: "primary" },
  nearLimit: { tone: "warning", icon: "alert-triangle", bar: "warning" },
  over: { tone: "danger", icon: "alert-circle", bar: "danger" },
};

interface BudgetRowProps {
  /** The category's name, or "Overall" for the budget that spans everything. */
  name: string;
  /** Absent for the overall budget (it gets a wallet instead of a category mark). */
  category?: Pick<Category, "name" | "color">;
  /** Decimal strings, exactly as the API sent them (base currency). */
  spent: string;
  budget: string;
  remaining: string;
  /** The API's percentage; it may exceed 100 — only the bar is clamped. */
  usagePercentage: number;
  /** Compact rows (on the home screen) leave out the line of figures under the bar. */
  compact?: boolean;
}

const useStyles = makeStyles(({ colors }) => ({
  row: { gap: space[3] },
  head: { flexDirection: "row", alignItems: "center", gap: space[3] },
  titles: { flex: 1, gap: 2 },
  foot: { flexDirection: "row", justifyContent: "space-between", gap: space[3] },
  walletTile: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
}));

/**
 * One budget, readable in a second: what it is for, how much of it is spent, how full the bar is,
 * and what is left. Status is a word and a glyph, never just a colour. Shared by the home screen
 * and the budgets screen, so a budget looks the same wherever it appears.
 */
export function BudgetRow({ name, category, spent, budget, remaining, usagePercentage, compact = false }: BudgetRowProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const baseCurrency = useBaseCurrency();
  const state = budgetStateOf(usagePercentage);
  const { tone, icon, bar } = STATE_STYLE[state];
  const isOver = state === "over";

  const amounts = t("budgets.amounts", { spent: formatCurrency(spent, baseCurrency), budget: formatCurrency(budget, baseCurrency) });
  const leftOrOver = isOver
    ? t("budgets.over", { amount: formatCurrency(Math.abs(Number(remaining)), baseCurrency) })
    : t("budgets.left", { amount: formatCurrency(remaining, baseCurrency) });
  const markSize = compact ? 32 : 40;

  return (
    <View style={styles.row} accessible accessibilityLabel={`${name}. ${t(`budgets.status.${state}`)}. ${amounts}. ${leftOrOver}`}>
      <View style={styles.head}>
        {category ? (
          <CategoryMark category={category} size={compact ? "sm" : "md"} />
        ) : (
          <View style={[styles.walletTile, { width: markSize, height: markSize, borderRadius: markSize * 0.32 }]}>
            <Icon name="wallet" size={compact ? 16 : 20} color={colors.primaryInk} />
          </View>
        )}
        <View style={styles.titles}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {amounts}
          </Text>
        </View>
        <Badge label={t(`budgets.status.${state}`)} tone={tone} icon={icon} />
      </View>

      <ProgressBar percentage={usagePercentage} tone={bar} />

      {compact ? null : (
        <View style={styles.foot}>
          <Text variant="caption" color={isOver ? "danger" : "textSecondary"}>
            {t("budgets.used", { percentage: formatPercentage(usagePercentage) })}
          </Text>
          <Text variant="label" color={isOver ? "danger" : "text"}>
            {leftOrOver}
          </Text>
        </View>
      )}
    </View>
  );
}
