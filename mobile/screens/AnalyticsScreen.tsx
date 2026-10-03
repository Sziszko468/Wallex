import { useCallback, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRefetchOnDataChange } from "../hooks/useOffline";
import { getCategoryAnalytics, getDashboard, getMonthlyAnalytics } from "../services/analyticsService";
import { listCategories } from "../services/categoriesService";
import { makeStyles, radius, space, useTheme } from "../theme";
import type { Category } from "../types/category";
import { Screen } from "../components/Screen";
import { SectionState } from "../components/SectionState";
import { MonthSelector } from "../components/MonthSelector";
import { CategoryDonut } from "../components/analytics/CategoryDonut";
import { MonthlyBars } from "../components/analytics/MonthlyBars";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { Text } from "../components/ui/Text";
import { MONTHS_PER_YEAR } from "../config/calendar";

const useStyles = makeStyles(() => ({
  section: { marginTop: space[5], gap: space[3] },
}));

/**
 * The month in more detail than the home screen has room for: twelve months of income and
 * expenses (tap one to switch to it) and the full spending breakdown by category.
 */
export function AnalyticsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const monthly = useAsyncData(useCallback(() => getMonthlyAnalytics({ year }), [year]));
  const breakdown = useAsyncData(useCallback(() => getCategoryAnalytics({ year, month }), [year, month]));
  // The month's total expenses, as the backend computed them (the ring shows it in the middle).
  const overview = useAsyncData(useCallback(() => getDashboard({ year, month }), [year, month]));
  const categories = useAsyncData(useCallback(() => listCategories(), []));

  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>();
    categories.data?.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories.data]);

  const reloadAll = useCallback(
    () => Promise.all([monthly.refetch(), breakdown.refetch(), overview.refetch(), categories.refetch()]),
    [monthly, breakdown, overview, categories]
  );
  useRefetchOnDataChange(() => void reloadAll());

  async function handleRefresh() {
    setIsRefreshing(true);
    await reloadAll();
    setIsRefreshing(false);
  }

  function goToPreviousMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(MONTHS_PER_YEAR);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (month === MONTHS_PER_YEAR) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <Screen
      scroll
      contentStyle={{ paddingTop: space[3] }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surfaceRaised} />}
    >
      <MonthSelector year={year} month={month} onPrevious={goToPreviousMonth} onNext={goToNextMonth} />

      <View style={styles.section}>
        <Text variant="heading" header>
          {t("analytics.months.title")}
        </Text>
        <SectionState isLoading={monthly.isLoading} error={monthly.error} onRetry={monthly.refetch} skeleton={<Skeleton height={220} radius={radius.lg} />}>
          {monthly.data ? (
            <Card padding={4}>
              <MonthlyBars months={monthly.data.months} selectedMonth={month} onSelect={setMonth} />
              <Text variant="caption" color="textTertiary" style={{ marginTop: space[3] }}>
                {t("analytics.months.hint")}
              </Text>
            </Card>
          ) : null}
        </SectionState>
      </View>

      <View style={styles.section}>
        <Text variant="heading" header>
          {t("analytics.categories.title")}
        </Text>
        <SectionState
          isLoading={breakdown.isLoading || categories.isLoading}
          error={breakdown.error ?? categories.error}
          onRetry={() => {
            void breakdown.refetch();
            void categories.refetch();
          }}
          skeleton={<Skeleton height={320} radius={radius.lg} />}
        >
          {breakdown.data ? (
            <Card padding={4}>
              {breakdown.data.categories.length === 0 ? (
                <Text variant="body" color="textSecondary">
                  {t("analytics.categories.empty")}
                </Text>
              ) : (
                <CategoryDonut categories={breakdown.data.categories} categoriesById={categoriesById} total={overview.data?.total_expenses} />
              )}
            </Card>
          ) : null}
        </SectionState>
      </View>
    </Screen>
  );
}
