from django.urls import path

from .views import (
    CategoryAnalyticsView,
    ComparisonView,
    DashboardView,
    InsightsView,
    MerchantsView,
    MonthlyAnalyticsView,
    SpendingPatternsView,
    TrendsView,
)

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="analytics-dashboard"),
    path("monthly/", MonthlyAnalyticsView.as_view(), name="analytics-monthly"),
    path("categories/", CategoryAnalyticsView.as_view(), name="analytics-categories"),
    path("comparison/", ComparisonView.as_view(), name="analytics-comparison"),
    path("trends/", TrendsView.as_view(), name="analytics-trends"),
    path("merchants/", MerchantsView.as_view(), name="analytics-merchants"),
    path("spending-patterns/", SpendingPatternsView.as_view(), name="analytics-spending-patterns"),
    path("insights/", InsightsView.as_view(), name="analytics-insights"),
]
