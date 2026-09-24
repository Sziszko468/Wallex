from django.urls import path

from .views import (
    CategoryAnalyticsView,
    ComparisonView,
    DashboardView,
    InsightsView,
    MonthlyAnalyticsView,
)

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="analytics-dashboard"),
    path("monthly/", MonthlyAnalyticsView.as_view(), name="analytics-monthly"),
    path("categories/", CategoryAnalyticsView.as_view(), name="analytics-categories"),
    path("comparison/", ComparisonView.as_view(), name="analytics-comparison"),
    path("insights/", InsightsView.as_view(), name="analytics-insights"),
]
