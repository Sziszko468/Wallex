from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import achievements, formatters, insights, merchants, patterns, services, trends
from .openapi import (
    ACHIEVEMENTS_LIST_SCHEMA,
    MARK_SEEN_SCHEMA,
    CATEGORIES_SCHEMA,
    COMPARISON_SCHEMA,
    DASHBOARD_SCHEMA,
    INSIGHTS_SCHEMA,
    MERCHANTS_SCHEMA,
    MONTHLY_SCHEMA,
    SPENDING_PATTERNS_SCHEMA,
    TRENDS_SCHEMA,
)
from .serializers import (
    AchievementSerializer,
    ComparisonQuerySerializer,
    MerchantsQuerySerializer,
    MonthQuerySerializer,
    TrendsQuerySerializer,
    YearQuerySerializer,
)


def _validated(serializer_class, request) -> dict:
    query = serializer_class(data=request.query_params)
    query.is_valid(raise_exception=True)
    return query.validated_data


@DASHBOARD_SCHEMA
class DashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = _validated(MonthQuerySerializer, request)
        dashboard = services.get_dashboard(
            request.user, query["year"], query["month"], today=timezone.localdate()
        )
        return Response(formatters.format_dashboard(dashboard))


@MONTHLY_SCHEMA
class MonthlyAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        year = _validated(YearQuerySerializer, request)["year"]
        months = services.get_monthly_analytics(request.user, year)
        return Response({"year": year, "months": formatters.format_monthly_analytics(months)})


@CATEGORIES_SCHEMA
class CategoryAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = _validated(MonthQuerySerializer, request)
        year, month = query["year"], query["month"]
        categories = services.get_category_breakdown(request.user, year, month)
        return Response(
            {"year": year, "month": month, "categories": formatters.format_category_breakdown(categories)}
        )


@COMPARISON_SCHEMA
class ComparisonView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = _validated(ComparisonQuerySerializer, request)
        comparison = services.get_comparison(request.user, query["year"], query["month"], against=query["against"])
        return Response(formatters.format_comparison(comparison))


@TRENDS_SCHEMA
class TrendsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = _validated(TrendsQuerySerializer, request)
        result = trends.get_trends(request.user, query["year"], query["month"], months=query["months"])
        return Response(formatters.format_trends(result))


@MERCHANTS_SCHEMA
class MerchantsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = _validated(MerchantsQuerySerializer, request)
        result = merchants.get_merchants(request.user, query["year"], query["month"], limit=query["limit"])
        return Response(formatters.format_merchants(result))


@SPENDING_PATTERNS_SCHEMA
class SpendingPatternsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = _validated(MonthQuerySerializer, request)
        result = patterns.get_spending_patterns(
            request.user, query["year"], query["month"], today=timezone.localdate()
        )
        return Response(formatters.format_spending_patterns(result))


@INSIGHTS_SCHEMA
class InsightsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = _validated(MonthQuerySerializer, request)
        year, month = query["year"], query["month"]
        generated = insights.generate_insights(request.user, year, month, today=timezone.localdate())
        return Response({"year": year, "month": month, "insights": formatters.format_insights(generated)})


class AchievementViewSet(viewsets.GenericViewSet):
    """Achievements are evaluated when they are read: the list is always up to date, and newly
    reached milestones are unlocked (and stored) the first time the user looks."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AchievementSerializer
    pagination_class = None

    @ACHIEVEMENTS_LIST_SCHEMA
    def list(self, request):
        records = achievements.evaluate(request.user, timezone.localdate())
        return Response(AchievementSerializer(records, many=True).data)

    @MARK_SEEN_SCHEMA
    @action(detail=False, methods=["post"], url_path="mark-seen")
    def mark_seen(self, request):
        return Response({"marked": achievements.mark_seen(request.user)})
