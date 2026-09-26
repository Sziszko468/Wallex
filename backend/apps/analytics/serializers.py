from django.utils import timezone
from rest_framework import serializers

from .merchants import DEFAULT_LIMIT as DEFAULT_MERCHANTS
from .merchants import MAX_LIMIT as MAX_MERCHANTS
from .services import Against
from .trends import DEFAULT_MONTHS, MAX_MONTHS, MIN_MONTHS


class MonthQuerySerializer(serializers.Serializer):
    year = serializers.IntegerField(
        required=False, min_value=2000, max_value=2100, help_text="Year (2000–2100). Default: the current year."
    )
    month = serializers.IntegerField(
        required=False, min_value=1, max_value=12, help_text="Month (1–12). Default: the current month."
    )

    def validate(self, attrs):
        today = timezone.now().date()
        attrs.setdefault("year", today.year)
        attrs.setdefault("month", today.month)
        return attrs


class TrendsQuerySerializer(MonthQuerySerializer):
    months = serializers.IntegerField(
        required=False,
        min_value=MIN_MONTHS,
        max_value=MAX_MONTHS,
        help_text=f"How many months, ending with year/month ({MIN_MONTHS}–{MAX_MONTHS}). Default: {DEFAULT_MONTHS}.",
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs.setdefault("months", DEFAULT_MONTHS)
        return attrs


class ComparisonQuerySerializer(MonthQuerySerializer):
    against = serializers.ChoiceField(
        choices=Against.CHOICES,
        required=False,
        help_text="`previous_month` (default) or `previous_year`: the same month one year earlier.",
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs.setdefault("against", Against.PREVIOUS_MONTH)
        return attrs


class MerchantsQuerySerializer(MonthQuerySerializer):
    limit = serializers.IntegerField(
        required=False,
        min_value=1,
        max_value=MAX_MERCHANTS,
        help_text=f"How many merchants, largest first (1–{MAX_MERCHANTS}). Default: {DEFAULT_MERCHANTS}.",
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs.setdefault("limit", DEFAULT_MERCHANTS)
        return attrs


class YearQuerySerializer(serializers.Serializer):
    year = serializers.IntegerField(
        required=False, min_value=2000, max_value=2100, help_text="Year (2000–2100). Default: the current year."
    )

    def validate(self, attrs):
        attrs.setdefault("year", timezone.now().date().year)
        return attrs
