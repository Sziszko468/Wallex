"""Everything WALLEX stores about one person (GDPR: access and portability), and erasing it.

The export lists every field of every table that holds the user's data, so a field added later is
included without anyone remembering to add it. Only what would help an attacker who got hold of the
file is left out: push tokens, session keys and the two-factor secret.
"""

import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

from apps.analytics.models import AssistantConversation, AssistantMessage, UserAchievement
from apps.budgets.models import Budget, SavingsGoal
from apps.categories.models import Category
from apps.notifications.models import Device, Notification, NotificationPreference
from apps.transactions.models import RecurringTransaction, Transaction

from . import mfa
from .models import AuditEvent, UserSession

EXPORT_FORMAT_VERSION = 1
ACCOUNT_FIELDS = ("email", "first_name", "last_name", "language", "base_currency", "date_joined", "last_login")

# section -> (rows of the user, columns left out of the export)
SECTIONS = {
    "categories": (lambda user: Category.objects.filter(user=user), set()),
    "transactions": (lambda user: Transaction.objects.filter(user=user), set()),
    # Subscriptions are recurring transactions flagged `is_subscription` (one table).
    "recurring_transactions": (lambda user: RecurringTransaction.objects.filter(user=user), set()),
    "budgets": (lambda user: Budget.objects.filter(user=user), set()),
    "savings_goals": (lambda user: SavingsGoal.objects.filter(user=user), set()),
    "achievements": (lambda user: UserAchievement.objects.filter(user=user), set()),
    "assistant_conversations": (lambda user: AssistantConversation.objects.filter(user=user), set()),
    "assistant_messages": (lambda user: AssistantMessage.objects.filter(conversation__user=user), set()),
    "notifications": (lambda user: Notification.objects.filter(user=user), set()),
    "notification_preferences": (lambda user: NotificationPreference.objects.filter(user=user), set()),
    "devices": (lambda user: Device.objects.filter(user=user), {"expo_push_token"}),
    "sessions": (lambda user: UserSession.objects.filter(user=user), {"key", "refresh_jti", "previous_refresh_jti"}),
    "security_events": (lambda user: AuditEvent.objects.filter(user=user), {"session_key"}),
}


def _rows(queryset, left_out: set[str]) -> list[dict]:
    columns = [field.attname for field in queryset.model._meta.concrete_fields if field.name not in left_out | {"user"}]
    return list(queryset.values(*columns))


def build_export(user) -> dict:
    """A JSON-ready dict of the user's account and every table row they own."""
    return {
        "format_version": EXPORT_FORMAT_VERSION,
        "exported_at": timezone.now(),
        "account": {
            **{name: getattr(user, name) for name in ACCOUNT_FIELDS},
            "two_factor_enabled": mfa.is_enabled(user),
        },
        **{section: _rows(rows(user), left_out) for section, (rows, left_out) in SECTIONS.items()},
    }


def export_json(user) -> str:
    return json.dumps(build_export(user), cls=DjangoJSONEncoder, ensure_ascii=False, indent=2)


@transaction.atomic
def delete_account(user) -> None:
    """Erases the account and, through the database's cascades, everything it owns."""
    user.delete()
