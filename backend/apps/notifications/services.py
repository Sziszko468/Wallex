"""Deciding *when* to notify, and delivering notifications as push messages.

Flow: a trigger (a transaction/budget change, or the scheduled command) calls
`notify()`, which respects the user's preferences, deduplicates on the event
key and stores a `Notification`. Delivery happens after the database commit;
if it fails, the row stays FAILED/PENDING and the scheduled command retries it.
"""

import calendar
import logging
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.analytics import services as analytics
from apps.analytics.insights import (
    BUDGET_WARNING_PERCENT,
    InsightType,
    Severity,
    generate_insights,
    whole_percent,
)
from apps.categories.models import TransactionType
from apps.transactions.models import RecurringTransaction
from apps.transactions.recurrence import next_occurrence_on_or_after

from . import expo
from .models import Device, Notification, NotificationKind, NotificationPreference, NotificationStatus

logger = logging.getLogger(__name__)

MAX_DELIVERY_ATTEMPTS = 3
RETRY_WINDOW = timedelta(hours=24)
# A PENDING row younger than this may still be delivered by its own request's on_commit hook.
PENDING_GRACE_PERIOD = timedelta(minutes=5)
ANDROID_CHANNEL_ID = "default"

# Budget insights are already covered by the real-time budget notifications.
_BUDGET_INSIGHT_TYPES = {InsightType.BUDGET_EXCEEDED, InsightType.BUDGET_WARNING}


# --- Devices & preferences ---------------------------------------------------


def get_preferences(user) -> NotificationPreference:
    preferences, _ = NotificationPreference.objects.get_or_create(user=user)
    return preferences


def register_device(user, *, expo_push_token: str, platform: str, name: str = "") -> tuple[Device, bool]:
    """Creates or refreshes the device. A token already registered to another user moves to this one."""
    return Device.objects.update_or_create(
        expo_push_token=expo_push_token,
        defaults={
            "user": user,
            "platform": platform,
            "name": name,
            "is_active": True,
            "last_seen_at": timezone.now(),
        },
    )


def reachable_devices(user):
    """Active devices whose app registered recently enough to still hold a valid session.

    The app re-registers on every signed-in launch. A device silent for longer
    than the refresh-token lifetime can no longer be signed in as this user, so
    it must not keep receiving their (financial) notifications.
    """
    cutoff = timezone.now() - settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    return Device.objects.filter(user=user, is_active=True, last_seen_at__gte=cutoff)


# --- Creating & delivering ---------------------------------------------------


def notify(
    user,
    kind: str,
    *,
    title: str,
    body: str,
    dedupe_key: str,
    data: dict | None = None,
    preferences: NotificationPreference | None = None,
) -> Notification | None:
    """Records a notification unless the user opted out or it was already sent for this event."""
    preferences = preferences or get_preferences(user)
    if not preferences.allows(kind):
        return None

    notification, created = Notification.objects.get_or_create(
        user=user,
        dedupe_key=dedupe_key,
        defaults={"kind": kind, "title": title, "body": body, "data": data or {}},
    )
    if not created:
        return None

    # After commit: never push about data that might still be rolled back, and a
    # push failure must never fail the request that triggered it (robust=True).
    transaction.on_commit(lambda: deliver(notification), robust=True)
    return notification


def _build_message(notification: Notification, device: Device) -> dict:
    return {
        "to": device.expo_push_token,
        "title": notification.title,
        "body": notification.body,
        "data": {**notification.data, "kind": notification.kind, "notification_id": notification.id},
        "sound": "default",
        "channelId": ANDROID_CHANNEL_ID,
        "priority": "high",
    }


def deliver(notification: Notification) -> None:
    devices = list(reachable_devices(notification.user))
    if not devices:
        notification.status = NotificationStatus.SKIPPED
        notification.save(update_fields=["status"])
        return

    notification.attempts += 1
    try:
        tickets = expo.send_push_messages([_build_message(notification, device) for device in devices])
    except expo.PushServiceError as error:
        logger.warning("Push delivery of notification %s failed: %s", notification.id, error)
        notification.status = NotificationStatus.FAILED
        notification.last_error = str(error)[:255]
        notification.save(update_fields=["status", "attempts", "last_error"])
        return

    errors = []
    for device, ticket in zip(devices, tickets):
        if ticket.ok:
            continue
        if ticket.error == expo.DEVICE_NOT_REGISTERED:
            device.is_active = False
            device.save(update_fields=["is_active", "updated_at"])
        errors.append(ticket.error or ticket.message or "unknown error")

    if len(errors) < len(devices):
        notification.status = NotificationStatus.SENT
        notification.sent_at = timezone.now()
    else:
        notification.status = NotificationStatus.FAILED
    notification.last_error = "; ".join(errors)[:255]
    notification.save(update_fields=["status", "attempts", "sent_at", "last_error"])


def retry_undelivered() -> int:
    now = timezone.now()
    candidates = Notification.objects.filter(
        status__in=[NotificationStatus.PENDING, NotificationStatus.FAILED],
        attempts__lt=MAX_DELIVERY_ATTEMPTS,
        created_at__gte=now - RETRY_WINDOW,
        created_at__lte=now - PENDING_GRACE_PERIOD,
    ).select_related("user")
    count = 0
    for notification in candidates:
        deliver(notification)
        count += 1
    return count


# --- Triggers ----------------------------------------------------------------


def check_budget_thresholds(user, year: int, month: int) -> None:
    """Called after anything that can change a month's budget usage (expense or budget written)."""
    preferences = get_preferences(user)
    if not (preferences.budget_warnings or preferences.budget_exceeded):
        return

    month_name = calendar.month_name[month]
    for usage in analytics.get_budget_usage(user, year, month):
        is_overall = usage["category_id"] is None
        budget_name = "overall" if is_overall else usage["category_name"]
        data = {"screen": "budgets", "budget_id": usage["budget_id"], "year": year, "month": month}
        used = whole_percent(usage["usage_percentage"])

        if usage["spent_amount"] > usage["budget_amount"]:
            notify(
                user,
                NotificationKind.BUDGET_EXCEEDED,
                title="Budget exceeded",
                body=f"You've spent {used}% of your {budget_name} budget for {month_name}.",
                dedupe_key=f"budget_exceeded:{usage['budget_id']}",
                data=data,
                preferences=preferences,
            )
        elif usage["usage_percentage"] >= BUDGET_WARNING_PERCENT:
            notify(
                user,
                NotificationKind.BUDGET_WARNING,
                title="Budget almost used",
                body=f"You've used {used}% of your {budget_name} budget for {month_name}.",
                dedupe_key=f"budget_warning:{usage['budget_id']}",
                data=data,
                preferences=preferences,
            )


def _due_phrase(days_left: int) -> str:
    if days_left == 0:
        return "today"
    if days_left == 1:
        return "tomorrow"
    return f"in {days_left} days"


def send_recurring_reminders(user, preferences: NotificationPreference, today: date) -> None:
    if not preferences.recurring_reminders:
        return
    recurring_expenses = RecurringTransaction.objects.filter(
        user=user, type=TransactionType.EXPENSE, is_active=True
    )
    for recurring in recurring_expenses:
        occurrence = next_occurrence_on_or_after(recurring, today)
        if occurrence is None:
            continue
        days_left = (occurrence - today).days
        if days_left > preferences.recurring_reminder_days:
            continue
        notify(
            user,
            NotificationKind.RECURRING_DUE,
            title="Upcoming payment",
            body=f"{recurring.name} is due {_due_phrase(days_left)}.",
            dedupe_key=f"recurring_due:{recurring.id}:{occurrence.isoformat()}",
            data={"screen": "recurring", "recurring_id": recurring.id, "date": occurrence.isoformat()},
            preferences=preferences,
        )


def is_important_insight(insight) -> bool:
    return insight.severity == Severity.ALERT and insight.type not in _BUDGET_INSIGHT_TYPES


def send_insight_notifications(user, preferences: NotificationPreference, today: date) -> None:
    if not preferences.insights:
        return
    for insight in generate_insights(user, today.year, today.month, today=today):
        if not is_important_insight(insight):
            continue
        notify(
            user,
            NotificationKind.INSIGHT,
            title="Spending insight",
            body=insight.message,
            # Once per insight per month, however often the scheduled job runs.
            dedupe_key=f"insight:{insight.id}:{today:%Y-%m}",
            data={"screen": "dashboard", "year": today.year, "month": today.month},
            preferences=preferences,
        )


def send_scheduled_notifications(today: date) -> int:
    """Reminders and insights for every user who can currently receive a push. Returns users processed."""
    cutoff = timezone.now() - settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    users = get_user_model().objects.filter(
        devices__is_active=True, devices__last_seen_at__gte=cutoff
    ).distinct()

    count = 0
    for user in users:
        preferences = get_preferences(user)
        send_recurring_reminders(user, preferences, today)
        send_insight_notifications(user, preferences, today)
        count += 1
    return count
