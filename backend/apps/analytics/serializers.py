from django.utils import timezone
from rest_framework import serializers


class MonthQuerySerializer(serializers.Serializer):
    year = serializers.IntegerField(required=False, min_value=2000, max_value=2100)
    month = serializers.IntegerField(required=False, min_value=1, max_value=12)

    def validate(self, attrs):
        today = timezone.now().date()
        attrs.setdefault("year", today.year)
        attrs.setdefault("month", today.month)
        return attrs


class YearQuerySerializer(serializers.Serializer):
    year = serializers.IntegerField(required=False, min_value=2000, max_value=2100)

    def validate(self, attrs):
        attrs.setdefault("year", timezone.now().date().year)
        return attrs
