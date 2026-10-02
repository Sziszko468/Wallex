from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import serializers

from apps.currencies.models import Currency

from . import achievements
from .merchants import DEFAULT_LIMIT as DEFAULT_MERCHANTS
from .merchants import MAX_LIMIT as MAX_MERCHANTS
from .models import AchievementCategory, AchievementUnit
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


# --- Achievements (output only) -------------------------------------------------------------


class AchievementSerializer(serializers.Serializer):
    """One achievement with the user's progress. Serializes a UserAchievement."""

    code = serializers.SlugField(help_text="Stable identifier, e.g. `streak_7`.")
    name = serializers.CharField(help_text="Catalog name, e.g. `Stayed Under Budget`.")
    title = serializers.CharField(
        help_text="What to show: the name, or how it was earned once unlocked — e.g. `Stayed Under Food Budget`."
    )
    detail = serializers.CharField(
        allow_null=True, help_text="Once unlocked, what it was earned with (`August 2026`, a goal's name); else `null`."
    )
    description = serializers.CharField(help_text="How to earn it.")
    icon = serializers.CharField(help_text="An emoji.")
    category = serializers.ChoiceField(choices=AchievementCategory.choices)
    unit = serializers.ChoiceField(
        choices=AchievementUnit.choices, help_text="What `progress` and `target` count: `count`, `days` or `money`."
    )
    target = serializers.DecimalField(max_digits=12, decimal_places=2, help_text="The value to reach.")
    target_currency = serializers.ChoiceField(
        choices=Currency.choices,
        allow_null=True,
        help_text="Currency of `target` and `progress` for `money`; else `null`.",
    )
    progress = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Current value towards `target` (a streak's current length, money saved…); equals `target` once unlocked.",
    )
    progress_percentage = serializers.FloatField(help_text="`progress / target × 100`, 0–100.")
    unlocked = serializers.BooleanField()
    unlocked_at = serializers.DateTimeField(allow_null=True, help_text="When it was unlocked; `null` while locked.")
    is_new = serializers.BooleanField(help_text="Unlocked but not shown to the user yet (see `mark-seen`).")

    def to_representation(self, record):
        achievement = record.achievement
        title, detail = achievements.title_and_detail(record)
        return super().to_representation(
            {
                "code": achievement.code,
                "name": _(achievement.name),
                "title": title,
                "detail": detail,
                "description": _(achievement.description),
                "icon": achievement.icon,
                "category": achievement.category,
                "unit": achievement.unit,
                "target": achievement.target,
                "target_currency": achievement.target_currency,
                "progress": record.progress,
                "progress_percentage": achievements.progress_percentage(record),
                "unlocked": record.is_unlocked,
                "unlocked_at": record.unlocked_at,
                "is_new": record.is_unlocked and record.seen_at is None,
            }
        )


class MarkSeenResultSerializer(serializers.Serializer):
    marked = serializers.IntegerField(help_text="How many unlocked achievements were new until now.")
