import { apiClient } from "./apiClient";
import type {
  CategoryAnalytics,
  CategoryAnalyticsParams,
  Comparison,
  ComparisonParams,
  DashboardParams,
  DashboardStats,
  InsightsParams,
  InsightsResponse,
  Merchants,
  MerchantsParams,
  MonthlyAnalytics,
  MonthlyAnalyticsParams,
  SpendingPatterns,
  Trends,
  TrendsParams,
} from "../types/dashboard";

export async function getDashboard(params?: DashboardParams): Promise<DashboardStats> {
  const response = await apiClient.get<DashboardStats>("/analytics/dashboard/", { params });
  return response.data;
}

export async function getMonthlyAnalytics(
  params?: MonthlyAnalyticsParams
): Promise<MonthlyAnalytics> {
  const response = await apiClient.get<MonthlyAnalytics>("/analytics/monthly/", { params });
  return response.data;
}

export async function getCategoryAnalytics(
  params?: CategoryAnalyticsParams
): Promise<CategoryAnalytics> {
  const response = await apiClient.get<CategoryAnalytics>("/analytics/categories/", { params });
  return response.data;
}

export async function getInsights(params?: InsightsParams): Promise<InsightsResponse> {
  const response = await apiClient.get<InsightsResponse>("/analytics/insights/", { params });
  return response.data;
}

export async function getComparison(params?: ComparisonParams): Promise<Comparison> {
  const response = await apiClient.get<Comparison>("/analytics/comparison/", { params });
  return response.data;
}

export async function getTrends(params?: TrendsParams): Promise<Trends> {
  const response = await apiClient.get<Trends>("/analytics/trends/", { params });
  return response.data;
}

export async function getMerchants(params?: MerchantsParams): Promise<Merchants> {
  const response = await apiClient.get<Merchants>("/analytics/merchants/", { params });
  return response.data;
}

export async function getSpendingPatterns(params?: DashboardParams): Promise<SpendingPatterns> {
  const response = await apiClient.get<SpendingPatterns>("/analytics/spending-patterns/", { params });
  return response.data;
}
