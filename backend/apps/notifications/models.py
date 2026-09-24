from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class DevicePlatform(models.TextChoices):
    # Push notifications are mobile-only for now: the web client never registers a device.
    IOS = "ios", "iOS"
    ANDROID = "android", "Android"


class Device(models.Model):
    """A mobile app installation that can receive push notifications for `user`."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    # Unique across users: the same phone signing into another account takes the token over.
    expo_push_token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10, choices=DevicePlatform.choices)
    name = models.CharField(max_length=100, blank=True, default="")
    # False once Expo reports the token as no longer registered.
    is_active = models.BooleanField(default=True)
    # Refreshed every time the signed-in app registers; see services.reachable_devices().
    last_seen_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_seen_at"]
        indexes = [models.Index(fields=["user", "is_active"], name="device_user_active_idx")]

    def __str__(self):
        return f"{self.get_platform_display()} device of {self.user}"


class NotificationKind(models.TextChoices):
    BUDGET_WARNING = "budget_warning", "Budget almost used"
    BUDGET_EXCEEDED = "budget_exceeded", "Budget exceeded"
    RECURRING_DUE = "recurring_due", "Upcoming recurring expense"
    INSIGHT = "insight", "Important insight"


class NotificationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"
    SKIPPED = "skipped", "Skipped (no reachable device)"


class Notification(models.Model):
    """One notification for a user — also the outbox record its push delivery is retried from."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField(max_length=20, choices=NotificationKind.choices)
    title = models.CharField(max_length=100)
    body = models.CharField(max_length=255)
    # Routing hints for the mobile app, e.g. {"screen": "budgets", "budget_id": 3}.
    data = models.JSONField(default=dict, blank=True)
    # Identifies the event being notified about (e.g. "budget_exceeded:12"), so
    # the same event never produces a second notification.
    dedupe_key = models.CharField(max_length=150)
    status = models.CharField(
        max_length=10, choices=NotificationStatus.choices, default=NotificationStatus.PENDING
    )
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.CharField(max_length=255, blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "dedupe_key"], name="notification_unique_event"),
        ]
        indexes = [models.Index(fields=["status", "created_at"], name="notification_status_idx")]

    def __str__(self):
        return f"{self.get_kind_display()} → {self.user} ({self.status})"


class NotificationPreference(models.Model):
    """Which notifications a user wants. Applies to all of their devices."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preference"
    )
    budget_warnings = models.BooleanField(default=True)
    budget_exceeded = models.BooleanField(default=True)
    recurring_reminders = models.BooleanField(default=True)
    insights = models.BooleanField(default=True)
    recurring_reminder_days = models.PositiveSmallIntegerField(
        default=2, validators=[MinValueValidator(1), MaxValueValidator(7)]
    )
    updated_at = models.DateTimeField(auto_now=True)

    KIND_FIELDS = {
        NotificationKind.BUDGET_WARNING: "budget_warnings",
        NotificationKind.BUDGET_EXCEEDED: "budget_exceeded",
        NotificationKind.RECURRING_DUE: "recurring_reminders",
        NotificationKind.INSIGHT: "insights",
    }

    def allows(self, kind: str) -> bool:
        return getattr(self, self.KIND_FIELDS[kind])

    def __str__(self):
        return f"Notification preferences of {self.user}"
