import { apiClient } from "./apiClient";
import type {
  CategoryAnalytics,
  CategoryAnalyticsParams,
  DashboardParams,
  DashboardStats,
  MonthlyAnalytics,
  MonthlyAnalyticsParams,
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
