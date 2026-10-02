from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from . import services
from .expo import is_expo_push_token
from .models import RELATED_TYPES, Device, Notification, NotificationPreference, RelatedType


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["id", "expo_push_token", "platform", "name", "is_active", "last_seen_at", "created_at"]
        read_only_fields = ["id", "is_active", "last_seen_at", "created_at"]
        # Registering a token that already exists is an update (see services.register_device),
        # so the model's unique constraint must not turn it into a validation error.
        extra_kwargs = {
            "expo_push_token": {
                "validators": [],
                "help_text": "From `Notifications.getExpoPushTokenAsync()`, e.g. `ExponentPushToken[…]`.",
            },
            "platform": {"help_text": "`ios` or `android`."},
            "name": {"help_text": "Optional label shown to the user, e.g. the phone model."},
            "is_active": {"help_text": "False once Expo reported the token as no longer registered."},
            "last_seen_at": {"help_text": "Last registration from this device (every signed-in app start)."},
        }

    def validate_expo_push_token(self, value: str) -> str:
        if not is_expo_push_token(value):
            raise serializers.ValidationError(_("Not a valid Expo push token."))
        return value


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "budget_warnings",
            "budget_exceeded",
            "subscription_reminders",
            "recurring_reminders",
            "savings_goals",
            "unusual_spending",
            "monthly_summary",
            "insights",
            "recurring_reminder_days",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
        extra_kwargs = {
            "budget_warnings": {"help_text": "`budget_warning`: a budget reaches 80 %."},
            "budget_exceeded": {"help_text": "`budget_exceeded`: a budget is exceeded."},
            "subscription_reminders": {
                "help_text": "`subscription_due`: a subscription payment is due within `recurring_reminder_days`."
            },
            "recurring_reminders": {
                "help_text": "`recurring_due`: any other recurring expense is due within `recurring_reminder_days`."
            },
            "savings_goals": {"help_text": "`savings_goal`: a savings goal reaches 25, 50, 75, 90 or 100 %."},
            "unusual_spending": {"help_text": "`unusual_spending`: a category is clearly above its usual level."},
            "monthly_summary": {"help_text": "`monthly_summary`: last month's spending, early in the month."},
            "insights": {"help_text": "`insight`: important (alert) insights such as overspending."},
            "recurring_reminder_days": {
                "help_text": "How many days before a subscription or other recurring payment to remind (1–7)."
            },
        }


class RelatedObjectSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=RelatedType.choices, help_text="What kind of object it is.")
    id = serializers.IntegerField(
        help_text="Its id, e.g. for `GET /api/budgets/{id}/`. The object may have been deleted since."
    )


class NotificationSerializer(serializers.ModelSerializer):
    """An inbox entry. Only `is_read` can be changed."""

    is_read = serializers.BooleanField(help_text="Set to mark the notification read (`true`) or unread (`false`).")
    related_object = serializers.SerializerMethodField(
        help_text="What the notification is about; `null` for a summary or a general insight."
    )

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "is_read", "read_at", "related_object", "data", "created_at"]
        read_only_fields = ["id", "kind", "title", "body", "read_at", "data", "created_at"]
        extra_kwargs = {
            "kind": {"help_text": "What happened; see the table in the list endpoint's description."},
            "title": {"help_text": "Written by the server; show as is."},
            "body": {"help_text": "Written by the server, amounts already formatted; show as is."},
            "read_at": {"help_text": "When it was first marked read; `null` while unread."},
            "data": {
                "help_text": (
                    "Navigation hints, the same as in the push payload: `screen` plus the ids, `year` and "
                    "`month` that screen needs."
                )
            },
        }

    @extend_schema_field(RelatedObjectSerializer(allow_null=True))
    def get_related_object(self, notification: Notification) -> dict | None:
        if notification.content_type_id is None:
            return None
        content_type = notification.content_type
        related_type = RELATED_TYPES[(content_type.app_label, content_type.model)]
        return {"type": related_type.value, "id": notification.object_id}

    def update(self, instance, validated_data):
        if "is_read" in validated_data:
            services.set_read(instance, validated_data["is_read"])
        return instance


class UnreadCountSerializer(serializers.Serializer):
    unread_count = serializers.IntegerField(help_text="Notifications not marked read yet.")


class MarkAllReadSerializer(serializers.Serializer):
    marked = serializers.IntegerField(help_text="How many notifications were unread (and are read now).")
