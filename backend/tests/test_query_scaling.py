"""No endpoint's query count may grow with the amount of data, and every endpoint sends money as
decimal strings — checked on EVERY readable route.

The same requests run for a user with a little data and for one with four times as much of
everything. An N+1 query (a query per row, e.g. a missing select_related or a per-object
computation in a serializer) makes the second count higher. Routes are read from the URLconf,
so an endpoint added later is covered without touching this file.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.analytics.models import AssistantConversation, AssistantMessage
from apps.budgets.models import Budget, SavingsGoal
from apps.categories.models import Category, TransactionType
from apps.notifications.models import Device, Notification, NotificationKind
from apps.subscriptions.models import Subscription
from apps.transactions.models import Frequency, RecurringTransaction, Transaction
from apps.users.models import UserSession
from conftest import issue_tokens
from tests.test_isolation_canary import GET_ROUTES, _path
from tests.test_money import _money_values

SMALL, LARGE = 2, 8


def _seed(email: str, n: int) -> dict:
    """n of everything (n² transactions), spread over this month and the previous one."""
    user = get_user_model().objects.create_user(username=email, email=email, password="unused-password-123")
    today = timezone.localdate()
    last_month = today.replace(day=1) - timedelta(days=1)
    income = Category.objects.create(user=user, name="Salary", type=TransactionType.INCOME)
    categories = [Category.objects.create(user=user, name=f"Cat {i}", type=TransactionType.EXPENSE) for i in range(n)]
    ids = {"category": categories[0].pk}
    for day in (today, last_month):
        Transaction.objects.create(user=user, category=income, type="income", amount=Decimal("1000.00"), date=day)
        for i, category in enumerate(categories):
            for j in range(n):
                transaction = Transaction.objects.create(
                    user=user, category=category, type="expense", amount=Decimal(10 + j), date=day.replace(day=1 + j),
                    description=f"Shop {i}",
                )
    ids["transaction"] = transaction.pk
    for i, category in enumerate(categories):
        budget = Budget.objects.create(user=user, category=category, amount=Decimal("100.00"), year=today.year, month=today.month)
        recurring = RecurringTransaction.objects.create(
            user=user, category=category, name=f"Rent {i}", type="expense", amount=Decimal("50.00"),
            frequency=Frequency.MONTHLY, start_date=date(2026, 1, 1 + i), next_occurrence_date=date(2026, 1, 1 + i),
        )
        subscription = Subscription.objects.create(
            user=user, category=category, name=f"Service {i}", amount=Decimal("9.99"), currency="USD" if i % 2 else "EUR",
            frequency=Frequency.MONTHLY, start_date=date(2026, 1, 1 + i), next_occurrence_date=date(2026, 1, 1 + i),
        )
        goal = SavingsGoal.objects.create(user=user, name=f"Goal {i}", target_amount=Decimal("1000.00"), current_amount=Decimal(i))
        device = Device.objects.create(user=user, expo_push_token=f"ExponentPushToken[{email}-{i}]", platform="ios")
        notification = Notification.objects.create(
            user=user, kind=NotificationKind.INSIGHT, title="Insight", body="Body", dedupe_key=f"k{i}"
        )
        conversation = AssistantConversation.objects.create(user=user, title=f"Question {i}")
        for role in ("user", "assistant"):
            AssistantMessage.objects.create(
                conversation=conversation, role=role, content="Text",
                sources=[{"tool": "get_monthly_spending", "arguments": {"year": today.year, "month": today.month}}],
            )
    ids.update(
        budget=budget.pk, recurringtransaction=recurring.pk, subscription=subscription.pk, savingsgoal=goal.pk,
        device=device.pk, notification=notification.pk, assistantconversation=conversation.pk,
    )
    for _ in range(n):  # other signed-in devices, for the session list
        issue_tokens(user)
    client = APIClient()
    access, _ = issue_tokens(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    ids["session"] = UserSession.objects.filter(user=user).latest("id").pk
    return {"client": client, "ids": ids}


# Required query parameters of routes that have them.
EXTRA_PARAMS = {"currency-convert": {"amount": "10.00", "currency": "USD"}}


def _count(client, path: str, name: str) -> tuple[int, int]:
    today = timezone.localdate()
    params = {"year": today.year, "month": today.month, **EXTRA_PARAMS.get(name, {})}
    client.get(path, params)  # first read may create lazily made rows (preferences, achievements)
    with CaptureQueriesContext(connection) as queries:
        response = client.get(path, params)
    return response.status_code, len(queries)


@pytest.fixture
def small_and_large(db, add_rates):
    add_rates(timezone.localdate() - timedelta(days=1), USD="1.10")
    return _seed("small@example.com", SMALL), _seed("large@example.com", LARGE)


@pytest.mark.django_db
@pytest.mark.parametrize(("route", "name"), GET_ROUTES, ids=[name for _, name in GET_ROUTES])
def test_query_count_does_not_grow_with_data(small_and_large, route, name):
    small, large = small_and_large

    small_status, small_queries = _count(small["client"], _path(route, name, small["ids"]), name)
    large_status, large_queries = _count(large["client"], _path(route, name, large["ids"]), name)

    assert small_status == large_status == 200, (small_status, large_status)
    assert large_queries <= small_queries, f"{name}: {small_queries} queries with little data, {large_queries} with more"


@pytest.mark.django_db
@pytest.mark.parametrize(("route", "name"), GET_ROUTES, ids=[name for _, name in GET_ROUTES])
def test_money_is_a_decimal_string_on_every_endpoint(small_and_large, route, name):
    """The money rule of test_money.py, on every GET route instead of a chosen list."""
    _, large = small_and_large
    today = timezone.localdate()
    params = {"year": today.year, "month": today.month, **EXTRA_PARAMS.get(name, {})}

    response = large["client"].get(_path(route, name, large["ids"]), params)

    body = response.json()
    if isinstance(body, dict):  # % changes keyed like the totals they describe (comparison) are numbers
        body = {key: value for key, value in body.items() if "percentage" not in key}
    not_strings = [(key, value) for key, value in _money_values(body) if not isinstance(value, str)]
    assert not not_strings, f"{name} returns money as a number: {not_strings[:5]}"
