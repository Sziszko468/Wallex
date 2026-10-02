from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
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
    """What a notification is about. apps/notifications/rules.py decides when each is created."""

    BUDGET_WARNING = "budget_warning", "Budget almost used"
    BUDGET_EXCEEDED = "budget_exceeded", "Budget exceeded"
    SUBSCRIPTION_DUE = "subscription_due", "Subscription payment approaching"
    RECURRING_DUE = "recurring_due", "Upcoming recurring expense"
    SAVINGS_GOAL = "savings_goal", "Savings goal progress"
    UNUSUAL_SPENDING = "unusual_spending", "Unusual spending"
    MONTHLY_SUMMARY = "monthly_summary", "Monthly spending summary"
    INSIGHT = "insight", "Important insight"


class RelatedType(models.TextChoices):
    """The kinds of object a notification can point at, as the API names them."""

    BUDGET = "budget", "Budget"
    SUBSCRIPTION = "subscription", "Subscription"
    RECURRING_TRANSACTION = "recurring_transaction", "Recurring transaction"
    SAVINGS_GOAL = "savings_goal", "Savings goal"
    CATEGORY = "category", "Category"


# (app_label, model) of the content type -> RelatedType. Subscription is a proxy model with a
# content type of its own (see services.notify), so the API can tell it from other recurring items.
RELATED_TYPES: dict[tuple[str, str], RelatedType] = {
    ("budgets", "budget"): RelatedType.BUDGET,
    ("subscriptions", "subscription"): RelatedType.SUBSCRIPTION,
    ("transactions", "recurringtransaction"): RelatedType.RECURRING_TRANSACTION,
    ("budgets", "savingsgoal"): RelatedType.SAVINGS_GOAL,
    ("categories", "category"): RelatedType.CATEGORY,
}


class NotificationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"
    SKIPPED = "skipped", "Skipped (no reachable device)"


class Notification(models.Model):
    """One notification for a user: an entry of their in-app inbox, and the outbox record its
    push delivery is retried from (`status`, `attempts`). The two are independent: a user
    without a phone still gets every notification in the app (status SKIPPED)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=20, choices=NotificationKind.choices)
    title = models.CharField(max_length=100)
    body = models.CharField(max_length=255)
    # What the notification is about (a budget, subscription, savings goal, category…), if anything.
    # Not a real foreign key: the object may be deleted later, the notification stays.
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE, null=True, blank=True)
    object_id = models.PositiveBigIntegerField(null=True, blank=True)
    related_object = GenericForeignKey("content_type", "object_id")
    # Routing hints for the mobile app, e.g. {"screen": "budgets", "budget_id": 3}.
    data = models.JSONField(default=dict, blank=True)
    # Identifies the event being notified about (e.g. "budget_exceeded:12"), so
    # the same event never produces a second notification.
    dedupe_key = models.CharField(max_length=150)
    read_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=NotificationStatus.choices, default=NotificationStatus.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.CharField(max_length=255, blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["user", "dedupe_key"], name="notification_unique_event"),
            models.CheckConstraint(
                condition=models.Q(content_type__isnull=True, object_id__isnull=True)
                | models.Q(content_type__isnull=False, object_id__isnull=False),
                name="notification_related_complete",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "created_at"], name="notification_status_idx"),
            models.Index(fields=["user", "-created_at"], name="notification_inbox_idx"),
            # The unread badge is requested on every app start.
            models.Index(fields=["user"], condition=models.Q(read_at__isnull=True), name="notification_unread_idx"),
            models.Index(fields=["content_type", "object_id"], name="notification_related_idx"),
        ]

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def __str__(self):
        return f"{self.get_kind_display()} → {self.user} ({self.status})"


class NotificationPreference(models.Model):
    """Which notifications a user wants: one switch per kind. A switched-off kind is not created
    at all — neither in the app nor as a push. Applies to all of the user's devices."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preference"
    )
    budget_warnings = models.BooleanField(default=True)
    budget_exceeded = models.BooleanField(default=True)
    subscription_reminders = models.BooleanField(default=True)
    recurring_reminders = models.BooleanField(default=True)
    savings_goals = models.BooleanField(default=True)
    unusual_spending = models.BooleanField(default=True)
    monthly_summary = models.BooleanField(default=True)
    insights = models.BooleanField(default=True)
    # How early subscription and other recurring-expense reminders arrive.
    recurring_reminder_days = models.PositiveSmallIntegerField(
        default=2, validators=[MinValueValidator(1), MaxValueValidator(7)]
    )
    updated_at = models.DateTimeField(auto_now=True)

    KIND_FIELDS = {
        NotificationKind.BUDGET_WARNING: "budget_warnings",
        NotificationKind.BUDGET_EXCEEDED: "budget_exceeded",
        NotificationKind.SUBSCRIPTION_DUE: "subscription_reminders",
        NotificationKind.RECURRING_DUE: "recurring_reminders",
        NotificationKind.SAVINGS_GOAL: "savings_goals",
        NotificationKind.UNUSUAL_SPENDING: "unusual_spending",
        NotificationKind.MONTHLY_SUMMARY: "monthly_summary",
        NotificationKind.INSIGHT: "insights",
    }

    def allows(self, kind: str) -> bool:
        return getattr(self, self.KIND_FIELDS[kind])

    def __str__(self):
        return f"Notification preferences of {self.user}"
