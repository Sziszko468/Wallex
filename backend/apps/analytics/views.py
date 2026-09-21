from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from . import formatters, services
from .serializers import MonthQuerySerializer, YearQuerySerializer


class DashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = MonthQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        dashboard = services.get_dashboard(
            request.user, query.validated_data["year"], query.validated_data["month"]
        )
        return Response(formatters.format_dashboard(dashboard))


class MonthlyAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = YearQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        year = query.validated_data["year"]
        months = services.get_monthly_analytics(request.user, year)
        return Response({"year": year, "months": formatters.format_monthly_analytics(months)})


class CategoryAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = MonthQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        year = query.validated_data["year"]
        month = query.validated_data["month"]
        categories = services.get_category_breakdown(request.user, year, month)
        return Response(
            {"year": year, "month": month, "categories": formatters.format_category_breakdown(categories)}
        )


class ComparisonView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = MonthQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        comparison = services.get_comparison(
            request.user, query.validated_data["year"], query.validated_data["month"]
        )
        return Response(formatters.format_comparison(comparison))
