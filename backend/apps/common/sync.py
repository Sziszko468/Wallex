"""Multi-device synchronization: "has anything changed since I last loaded?".

The web app and the phones never keep their own copy of the truth: every device reads
and writes the same PostgreSQL data through this API, so there is nothing to merge. A
device is in sync as soon as it re-reads what changed — the only question is *when* to
re-read. GET /api/sync/status/ answers that cheaply (one query, no data downloaded):

- per resource: how many objects the user has and when the last one was written
  (`updated_at`, set by the server — device clocks are never trusted),
- `version`: a fingerprint of all of it. Clients poll it (every 30 s while visible, and
  when the app/tab comes back to the foreground) and reload their views only when it
  changes.

Count + last write catch every kind of change: a new or edited object moves the last
write, a deletion lowers the count. Bulk writes (base-currency conversion) set
`updated_at` explicitly for that reason, and tests check that every write endpoint moves
the version. Nothing a GET does may change it, or clients would reload in a loop.
"""

import hashlib
from dataclasses import dataclass
from datetime import datetime

from django.db.models import CharField, Count, Max, Value
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.budgets.models import Budget, SavingsGoal
from apps.categories.models import Category
from apps.transactions.models import RecurringTransaction, Transaction

from .openapi import SYNC_STATUS_SCHEMA
from .serializers import SyncStatusSerializer

# API name -> model. Subscriptions are RecurringTransaction rows, so they are included.
FINGERPRINT_LENGTH = 20  # hex characters kept of the SHA-256: plenty to tell two states apart

SYNCED_RESOURCES = {
    "transactions": Transaction,
    "categories": Category,
    "budgets": Budget,
    "recurring_transactions": RecurringTransaction,
    "savings_goals": SavingsGoal,
}


@dataclass(frozen=True)
class ResourceState:
    count: int
    last_modified: datetime | None  # None while the user has no such object


def resource_states(user) -> dict[str, ResourceState]:
    """Count and last write per resource, in one query (UNION ALL of per-table aggregates)."""
    parts = [
        model.objects.filter(user=user)
        .order_by()
        .values("user")  # a single group: this user's rows
        .annotate(count=Count("id"), last_modified=Max("updated_at"))
        .values_list(Value(name, output_field=CharField()), "count", "last_modified")
        for name, model in SYNCED_RESOURCES.items()
    ]
    rows = parts[0].union(*parts[1:], all=True)
    states = {name: ResourceState(0, None) for name in SYNCED_RESOURCES}  # no rows = no group
    for name, count, last_modified in rows:
        states[name] = ResourceState(count, last_modified)
    return states


def sync_version(base_currency: str, states: dict[str, ResourceState]) -> str:
    """Fingerprint of the user's data. The base currency is in it because it changes every
    amount a client shows, even for a user without transactions or budgets."""
    parts = [f"base_currency={base_currency}"] + [
        f"{name}={state.count}@{state.last_modified.isoformat() if state.last_modified else '-'}"
        for name, state in sorted(states.items())
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:FINGERPRINT_LENGTH]


def get_sync_status(user) -> dict:
    states = resource_states(user)
    return {
        "version": sync_version(user.base_currency, states),
        "server_time": timezone.now(),
        "resources": states,
    }


@SYNC_STATUS_SCHEMA
class SyncStatusView(APIView):
    def get(self, request):
        return Response(SyncStatusSerializer(get_sync_status(request.user)).data)
