import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { FULL_PERCENT } from "../../config/budget";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { makeStyles, space, useTheme } from "../../theme";
import type { DashboardStats } from "../../types/dashboard";
import { formatCurrency, formatMonthYear, formatSignedAmount } from "../../utils/format";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Card } from "../ui/Card";
import { ProgressBar } from "../ui/ProgressBar";
import { Text } from "../ui/Text";
import { RingDecoration } from "./RingDecoration";

const STAT_MIN_WIDTH = 132;

interface BalanceCardProps {
  stats: DashboardStats;
}

const useStyles = makeStyles(({ colors }) => ({
  ring: { position: "absolute", top: -56, right: -48 },
  figures: { gap: space[1], marginBottom: space[4] },
  stats: { flexDirection: "row", flexWrap: "wrap", columnGap: space[4], rowGap: space[3], marginTop: space[4] },
  // Two side by side on a normal phone; stacked when the card is too narrow for both figures.
  stat: { flexGrow: 1, flexBasis: STAT_MIN_WIDTH, gap: space[1] },
  statHeading: { flexDirection: "row", alignItems: "center", gap: space[2] },
  statLabel: { flexShrink: 1 },
  statTile: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  incomeTile: { backgroundColor: colors.successSoft },
  expenseTile: { backgroundColor: colors.dangerSoft },
}));

/**
 * The signature piece of the home screen: one big figure (what is left this month), with what came
 * in and what went out beneath it. A warm sage panel with the brand ring behind it — a surface of
 * its own, not another card in a stack of identical ones.
 */
export function BalanceCard({ stats }: BalanceCardProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const baseCurrency = useBaseCurrency();
  const isNegative = Number(stats.balance) < 0;

  // How much of what came in is already gone — only for the length of the bar, never shown as a number.
  const income = Number(stats.total_income);
  const expenses = Number(stats.total_expenses);
  const spentShare = income > 0 ? Math.min(FULL_PERCENT, (expenses / income) * FULL_PERCENT) : expenses > 0 ? FULL_PERCENT : 0;

  return (
    <Card tone="wash" padding={5}>
      <View style={styles.ring}>
        <RingDecoration />
      </View>

      <View style={styles.figures}>
        <Text variant="overline" color="textSecondary">
          {t("dashboard.summary.balance")} · {formatMonthYear(stats.year, stats.month)}
        </Text>
        <Text variant="display" color={isNegative ? "danger" : "text"} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {formatCurrency(stats.balance, baseCurrency)}
        </Text>
        <Text variant="caption" color="textSecondary">
          {t("dashboard.summary.count", { count: stats.transaction_count })}
        </Text>
      </View>

      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ProgressBar percentage={spentShare} tone="danger" height={6} />
      </View>

      <View style={styles.stats}>
        <Stat
          icon="arrow-down-left"
          tileStyle={styles.incomeTile}
          iconColor={colors.success}
          label={t("dashboard.summary.income")}
          value={formatSignedAmount("income", stats.total_income, baseCurrency)}
          valueColor="success"
        />
        <Stat
          icon="arrow-up-right"
          tileStyle={styles.expenseTile}
          iconColor={colors.danger}
          label={t("dashboard.summary.expenses")}
          value={formatSignedAmount("expense", stats.total_expenses, baseCurrency)}
          valueColor="text"
        />
      </View>
    </Card>
  );
}

interface StatProps {
  icon: IconName;
  tileStyle: StyleProp<ViewStyle>;
  iconColor: string;
  label: string;
  value: string;
  valueColor: "success" | "text";
}

function Stat({ icon, tileStyle, iconColor, label, value, valueColor }: StatProps) {
  const styles = useStyles();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.statHeading}>
        <View style={[styles.statTile, tileStyle]}>
          <Icon name={icon} size={14} color={iconColor} strokeWidth={2} />
        </View>
        <Text variant="caption" color="textSecondary" style={styles.statLabel}>
          {label}
        </Text>
      </View>
      {/* The figure gets the tile's whole width, and no line limit: a long one wraps rather than losing digits. */}
      <Text variant="bodyStrong" color={valueColor}>
        {value}
      </Text>
    </View>
  );
}
