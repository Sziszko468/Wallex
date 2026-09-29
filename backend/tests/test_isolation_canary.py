"""User A never sees user B's data — checked on EVERY readable endpoint, not a chosen few.

User B gets one of everything, each marked with a canary string (and one distinctive amount).
User A, with no data of their own, then calls every GET route in the URLconf — list routes,
summaries, analytics, the security log, and every detail or action route pointed at B's own
object ids. No response may contain a canary, B's email or B's amount, and B's objects must
be 404. The routes are read from the URLconf, so an endpoint added later is covered without
touching this file.
"""

import re
from datetime import date
from decimal import Decimal

import pytest
from django.urls import URLPattern, URLResolver, get_resolver
from django.utils import timezone

from apps.analytics.models import AssistantConversation, AssistantMessage
from apps.budgets.models import Budget, SavingsGoal
from apps.categories.models import Category, TransactionType
from apps.notifications.models import Device, Notification, NotificationKind
from apps.subscriptions.models import Subscription
from apps.transactions.models import Frequency, RecurringTransaction, Transaction
from apps.users import audit
from apps.users.models import AuditAction
from apps.users.sessions import start_session

CANARY = "CANARY-B"
AMOUNT = "7777.77"
SKIPPED = {"api-schema", "api-docs"}  # public, and describe the API, not anyone's data


def _get_routes():
    """(regex, url name) of every /api/ route answering GET."""

    def walk(patterns, prefix=""):
        for pattern in patterns:
            if isinstance(pattern, URLResolver):
                yield from walk(pattern.url_patterns, prefix + str(pattern.pattern))
            elif isinstance(pattern, URLPattern):
                yield prefix + str(pattern.pattern), pattern

    for route, pattern in walk(get_resolver().url_patterns):
        if not route.startswith("api/") or "format" in route or pattern.name in SKIPPED:
            continue
        view = pattern.callback
        actions = getattr(view, "actions", None)  # ViewSet routes
        view_class = getattr(view, "view_class", None) or getattr(view, "cls", None)
        answers_get = "get" in actions if actions is not None else hasattr(view_class, "get")
        if answers_get:
            yield route, pattern.name


GET_ROUTES = sorted(set(_get_routes()))


@pytest.fixture
def user_b_owns_everything(other_user):
    """One of every kind of object for B, marked. Returns B's object id per url-name prefix."""
    today = timezone.localdate()
    category = Category.objects.create(user=other_user, name=f"{CANARY} category", type=TransactionType.EXPENSE)
    transaction = Transaction.objects.create(
        user=other_user, category=category, type="expense", amount=Decimal(AMOUNT), date=today,
        description=f"{CANARY} groceries",
    )
    budget = Budget.objects.create(user=other_user, category=category, amount=Decimal(AMOUNT), year=today.year, month=today.month)
    recurring = RecurringTransaction.objects.create(
        user=other_user, category=category, name=f"{CANARY} rent", type="expense", amount=Decimal(AMOUNT),
        frequency=Frequency.MONTHLY, start_date=date(2026, 1, 1), next_occurrence_date=date(2026, 1, 1),
    )
    subscription = Subscription.objects.create(
        user=other_user, category=category, name=f"{CANARY} streaming", amount=Decimal("17.99"),
        frequency=Frequency.MONTHLY, start_date=date(2026, 1, 5), next_occurrence_date=date(2026, 1, 5),
    )
    goal = SavingsGoal.objects.create(user=other_user, name=f"{CANARY} trip", target_amount=Decimal(AMOUNT))
    device = Device.objects.create(
        user=other_user, expo_push_token="ExponentPushToken[canaryb]", platform="ios", name=f"{CANARY} phone"
    )
    notification = Notification.objects.create(
        user=other_user, kind=NotificationKind.INSIGHT, title=f"{CANARY} insight", body=f"{CANARY} body", dedupe_key="b"
    )
    conversation = AssistantConversation.objects.create(user=other_user, title=f"{CANARY} question")
    AssistantMessage.objects.create(conversation=conversation, role="user", content=f"{CANARY} question")
    AssistantMessage.objects.create(
        conversation=conversation, role="assistant", content=f"{CANARY} answer: {AMOUNT} EUR",
        sources=[{"tool": "get_savings_progress", "arguments": {"goal": f"{CANARY} trip"}}],
    )
    session, _ = start_session(other_user)
    session.user_agent = f"{CANARY} browser"
    session.save()
    audit.record(AuditAction.OBJECT_DELETED, user=other_user, object_type=f"{CANARY}", object_id=1)
    return {
        "category": category.pk,
        "transaction": transaction.pk,
        "budget": budget.pk,
        "recurringtransaction": recurring.pk,
        "subscription": subscription.pk,
        "savingsgoal": goal.pk,
        "device": device.pk,
        "notification": notification.pk,
        "session": session.pk,
        "assistantconversation": conversation.pk,
    }


def _path(route: str, name: str, ids: dict) -> str:
    path = "/" + route.replace("^", "").replace("$", "")
    resource = (name or "").split("-")[0]
    return re.sub(r"\(\?P<pk>[^)]*\)", str(ids.get(resource, 999999)), path)


def test_the_sweep_covers_the_api():
    names = {name for _, name in GET_ROUTES}
    # A sanity floor: if route discovery broke, the sweep would silently check nothing.
    assert len(GET_ROUTES) >= 35  # 37 when written
    assert {"transaction-list", "transaction-detail", "analytics-dashboard", "auth-security-events", "session-list"} <= names
    assert {"assistant-status", "assistantconversation-list", "assistantconversation-detail"} <= names


@pytest.mark.django_db
@pytest.mark.parametrize(("route", "name"), GET_ROUTES, ids=[name for _, name in GET_ROUTES])
def test_user_a_never_receives_user_bs_data(auth_client, other_user, user_b_owns_everything, route, name):
    today = timezone.localdate()
    path = _path(route, name, user_b_owns_everything)

    response = auth_client.get(path, {"year": today.year, "month": today.month})
    body = response.content.decode(errors="replace")

    assert CANARY not in body, f"{path} leaked user B's data"
    assert other_user.email not in body, f"{path} leaked user B's email"
    assert AMOUNT not in body and "7,777" not in body, f"{path} leaked user B's amount"
    if "(?P<pk>" in route:
        assert response.status_code in (404, 405), f"{path} answered {response.status_code} for user B's object"
    else:
        assert response.status_code < 500
