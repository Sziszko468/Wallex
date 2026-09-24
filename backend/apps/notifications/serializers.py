from rest_framework import serializers

from .expo import is_expo_push_token
from .models import Device, NotificationPreference


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["id", "expo_push_token", "platform", "name", "is_active", "last_seen_at", "created_at"]
        read_only_fields = ["id", "is_active", "last_seen_at", "created_at"]
        # Registering a token that already exists is an update (see services.register_device),
        # so the model's unique constraint must not turn it into a validation error.
        extra_kwargs = {"expo_push_token": {"validators": []}}

    def validate_expo_push_token(self, value: str) -> str:
        if not is_expo_push_token(value):
            raise serializers.ValidationError("Not a valid Expo push token.")
        return value


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "budget_warnings",
            "budget_exceeded",
            "recurring_reminders",
            "insights",
            "recurring_reminder_days",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
