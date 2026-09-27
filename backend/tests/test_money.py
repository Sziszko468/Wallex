"""Financial correctness across the API: exact decimal arithmetic, strict input
precision, and money never leaving the server as a float."""

from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status

from apps.budgets.models import Budget, SavingsGoal
from apps.categories.models import Category, TransactionType
from apps.subscriptions.models import Subscription
from apps.transactions.models import Frequency, Transaction

MONEY_KEYS = {
    "amount", "total_income", "total_expenses", "balance", "income", "expenses",
    "budget_amount", "spent_amount", "remaining_amount", "base_amount",
    "exchange_rate",  # not money, but a decimal that must never become a float either
    "total", "average", "previous_total", "average_monthly_expenses", "average_daily_spending",
    "average_per_day", "fixed_expenses", "variable_expenses", "recurring_commitments", "expected_to_date",
    "current_amount", "previous_amount", "change_amount",
    "monthly_cost", "yearly_cost", "base_monthly_cost", "base_yearly_cost", "monthly_total", "yearly_total",
    "due_this_month", "target_amount", "current_amount", "remaining_amount", "monthly_needed",
    "base_current_amount", "base_target_amount", "total_saved", "total_target",
    "progress", "target",  # achievements: money progress (and, for consistency, every other kind) as strings
}


@pytest.fixture
def food(user):
    return Category.objects.create(user=user, name="Food", type=TransactionType.EXPENSE)


@pytest.fixture
def salary(user):
    return Category.objects.create(user=user, name="Salary", type=TransactionType.INCOME)


def _money_values(payload):
    """Every value under a money key anywhere in a JSON-like structure."""
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in MONEY_KEYS and value is not None:
                yield key, value
            yield from _money_values(value)
    elif isinstance(payload, list):
        for item in payload:
            yield from _money_values(item)


def _post(client, category, amount, tx_type="expense"):
    return client.post(
        reverse("transaction-list"),
        {"category": category.id, "type": tx_type, "amount": amount, "date": "2026-09-10"},
        format="json",
    )


@pytest.mark.django_db
def test_sums_are_exact_not_floating_point(auth_client, food):
    for amount in ("0.10", "0.20", "0.30"):
        assert _post(auth_client, food, amount).status_code == status.HTTP_201_CREATED

    dashboard = auth_client.get(reverse("analytics-dashboard"), {"year": 2026, "month": 9}).data

    # 0.1 + 0.2 + 0.3 == 0.6000000000000001 in floats
    assert dashboard["total_expenses"] == "0.60"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "amount",
    [
        "12.345",  # more than 2 decimal places
        "12345678901.00",  # more than 10 integer digits (max_digits=12)
        "0.00",
        "-5.00",
        "NaN",
        "",
    ],
)
def test_invalid_amounts_are_rejected_not_rounded_or_crashed(auth_client, food, amount):
    response = _post(auth_client, food, amount)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "amount" in response.data
    assert not Transaction.objects.exists()


@pytest.mark.django_db
def test_largest_storable_amount_round_trips_exactly(auth_client, food):
    response = _post(auth_client, food, "9999999999.99")

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["amount"] == "9999999999.99"


@pytest.mark.django_db
def test_budget_usage_rounding(auth_client, user, food):
    Budget.objects.create(user=user, category=food, amount=Decimal("30.00"), year=2026, month=9)
    _post(auth_client, food, "10.00")

    [usage] = auth_client.get(reverse("analytics-dashboard"), {"year": 2026, "month": 9}).data["budget_usage"]

    assert usage["spent_amount"] == "10.00"
    assert usage["remaining_amount"] == "20.00"
    assert usage["usage_percentage"] == pytest.approx(33.33)


@pytest.mark.django_db
def test_negative_balance_and_overspent_budget(auth_client, user, food, salary):
    Budget.objects.create(user=user, category=food, amount=Decimal("100.00"), year=2026, month=9)
    _post(auth_client, salary, "50.00", tx_type="income")
    _post(auth_client, food, "150.00")

    dashboard = auth_client.get(reverse("analytics-dashboard"), {"year": 2026, "month": 9}).data

    assert dashboard["balance"] == "-100.00"
    assert dashboard["budget_usage"][0]["remaining_amount"] == "-50.00"
    assert dashboard["budget_usage"][0]["usage_percentage"] == 150.0


@pytest.mark.django_db
def test_money_is_always_serialized_as_a_decimal_string(auth_client, user, food, salary):
    """DRF turns a raw Decimal into a float outside serializers — every money field must stay a string."""
    Budget.objects.create(user=user, category=food, amount=Decimal("100.00"), year=2026, month=9)
    Budget.objects.create(user=user, category=None, amount=Decimal("500.00"), year=2026, month=9)
    Transaction.objects.create(
        user=user, category=food, type=TransactionType.EXPENSE, amount=Decimal("12.34"), date=date(2026, 9, 3)
    )
    Transaction.objects.create(
        user=user, category=salary, type=TransactionType.INCOME, amount=Decimal("1000.00"), date=date(2026, 9, 1)
    )
    Transaction.objects.create(
        user=user, category=food, type=TransactionType.EXPENSE, amount=Decimal("15000"),
        currency="HUF", exchange_rate=Decimal("0.0025650891"), date=date(2026, 9, 4), description="Spar",
    )
    Subscription.objects.create(
        user=user, category=food, name="Meal kit", amount=Decimal("10.00"), frequency=Frequency.WEEKLY,
        start_date=date(2026, 9, 1), next_occurrence_date=date(2026, 9, 1),
    )
    SavingsGoal.objects.create(
        user=user, name="Japan trip", target_amount=Decimal("3000.00"), current_amount=Decimal("1850.10"),
        target_date=date(2099, 1, 1),
    )
    month = {"year": 2026, "month": 9}
    responses = {
        "dashboard": auth_client.get(reverse("analytics-dashboard"), month),
        "monthly": auth_client.get(reverse("analytics-monthly"), {"year": 2026}),
        "categories": auth_client.get(reverse("analytics-categories"), month),
        "comparison": auth_client.get(reverse("analytics-comparison"), month),
        "insights": auth_client.get(reverse("analytics-insights"), month),
        "trends": auth_client.get(reverse("analytics-trends"), month),
        "year-over-year": auth_client.get(reverse("analytics-comparison"), {**month, "against": "previous_year"}),
        "merchants": auth_client.get(reverse("analytics-merchants"), month),
        "spending-patterns": auth_client.get(reverse("analytics-spending-patterns"), month),
        "budgets": auth_client.get(reverse("budget-list")),
        "transactions": auth_client.get(reverse("transaction-list")),
        "subscriptions": auth_client.get(reverse("subscription-list")),
        "subscription-summary": auth_client.get(reverse("subscription-summary")),
        "savings-goals": auth_client.get(reverse("savingsgoal-list")),
        "savings-summary": auth_client.get(reverse("savingsgoal-summary")),
        "achievements": auth_client.get(reverse("achievement-list")),
    }

    checked = 0
    for name, response in responses.items():
        assert response.status_code == status.HTTP_200_OK, name
        for key, value in _money_values(response.json()):
            assert isinstance(value, str), f"{name}.{key} = {value!r}"
            Decimal(value)  # and a valid decimal
            checked += 1
    assert checked > 20  # the walk really found the money fields


@pytest.mark.django_db
def test_converted_values_are_exact_decimals(auth_client, food, add_rates):
    add_rates(date(2026, 9, 10), HUF="389.85")

    created = auth_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "15000", "currency": "HUF", "date": "2026-09-10"},
        format="json",
    ).json()
    auth_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "0.10", "date": "2026-09-10"},
        format="json",
    )
    dashboard = auth_client.get(reverse("analytics-dashboard"), {"year": 2026, "month": 9}).json()

    assert created["exchange_rate"] == "0.0025650891"
    assert created["base_amount"] == "38.48"  # 15000 × 0.0025650891 = 38.4763… → 38.48
    assert dashboard["total_expenses"] == "38.58"  # exact decimal sum of base amounts
