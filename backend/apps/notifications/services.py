"""Storing, reading and delivering notifications.

Flow: a rule (apps/notifications/rules.py — the only place that decides *whether*
something is worth a notification) calls `notify()`, which respects the user's
preferences, deduplicates on the event key and stores a `Notification`. The row is
the user's in-app inbox entry at once; the push to their phones happens after the
database commit. If the push fails, the row stays FAILED/PENDING and the scheduled
command retries it.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import models, transaction
from django.utils import timezone

from . import expo
from .models import RELATED_TYPES, Device, Notification, NotificationPreference, NotificationStatus

logger = logging.getLogger(__name__)

MAX_DELIVERY_ATTEMPTS = 3
LAST_ERROR_MAX_LENGTH = Notification._meta.get_field("last_error").max_length
RETRY_WINDOW = timedelta(hours=24)
# A PENDING row younger than this may still be delivered by its own request's on_commit hook.
PENDING_GRACE_PERIOD = timedelta(minutes=5)
ANDROID_CHANNEL_ID = "default"

# What a notification is about: (model, primary key), e.g. (Budget, 12).
RelatedObject = tuple[type[models.Model], int]


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


def related_content_type(model: type[models.Model]) -> ContentType:
    """The content type stored for `model`. Cached by Django: no query after the first."""
    # for_concrete_model=False: a Subscription keeps its own (proxy) type instead of RecurringTransaction.
    content_type = ContentType.objects.get_for_model(model, for_concrete_model=False)
    if (content_type.app_label, content_type.model) not in RELATED_TYPES:
        raise ValueError(f"{model.__name__} can't be the related object of a notification")
    return content_type


def already_notified(user, dedupe_key: str) -> bool:
    """For rules whose facts are costly to compute: skip the work when the event is done."""
    return Notification.objects.filter(user=user, dedupe_key=dedupe_key).exists()


def notify(
    user,
    kind: str,
    *,
    title: str,
    body: str,
    dedupe_key: str,
    related: RelatedObject | None = None,
    data: dict | None = None,
    preferences: NotificationPreference | None = None,
) -> Notification | None:
    """Records a notification unless the user opted out or it was already sent for this event."""
    preferences = preferences or get_preferences(user)
    if not preferences.allows(kind):
        return None

    defaults = {"kind": kind, "title": title, "body": body, "data": data or {}}
    if related is not None:
        model, object_id = related
        defaults.update(content_type=related_content_type(model), object_id=object_id)
    notification, created = Notification.objects.get_or_create(user=user, dedupe_key=dedupe_key, defaults=defaults)
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
        notification.last_error = str(error)[:LAST_ERROR_MAX_LENGTH]
        notification.save(update_fields=["status", "attempts", "last_error"])
        return

    errors = []
    for device, ticket in zip(devices, tickets, strict=False):  # Expo answers one ticket per message, in order
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
    notification.last_error = "; ".join(errors)[:LAST_ERROR_MAX_LENGTH]
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


# --- The in-app inbox --------------------------------------------------------


def inbox(user):
    """The user's notifications, newest first."""
    return Notification.objects.filter(user=user).select_related("content_type")


def unread_count(user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).count()


def set_read(notification: Notification, is_read: bool) -> Notification:
    """Marks one notification read or unread. Marking it read again keeps the first `read_at`."""
    if notification.is_read != is_read:
        notification.read_at = timezone.now() if is_read else None
        notification.save(update_fields=["read_at"])
    return notification


def mark_all_read(user) -> int:
    """Returns how many notifications were unread."""
    return Notification.objects.filter(user=user, read_at__isnull=True).update(read_at=timezone.now())
