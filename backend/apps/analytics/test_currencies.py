"""Every total is in the user's base currency: analytics add up base_amount, never amount."""

from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.analytics import patterns, services
from apps.budgets.models import Budget
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

SEP = {"year": 2026, "month": 9}


def _tx(user, category, amount, currency="EUR", rate="1", day=date(2026, 9, 10)):
    return Transaction.objects.create(
        user=user, category=category, type=category.type, amount=Decimal(amount),
        currency=currency, exchange_rate=Decimal(rate), date=day,
    )


@pytest.fixture
def mixed_month(user, food_category, transport_category, salary_category):
    """September: 15000 HUF (37.50 EUR) + 12.50 EUR for food, 20 USD (16.00 EUR) for transport, 1000 EUR income."""
    _tx(user, food_category, "15000", currency="HUF", rate="0.0025")
    _tx(user, food_category, "12.50")
    _tx(user, transport_category, "20.00", currency="USD", rate="0.8")
    _tx(user, salary_category, "1000.00")
    Budget.objects.create(user=user, category=food_category, amount=Decimal("40.00"), **SEP)


@pytest.mark.django_db
def test_dashboard_totals_are_in_the_base_currency(auth_client, mixed_month):
    dashboard = auth_client.get(reverse("analytics-dashboard"), SEP).json()

    assert dashboard["total_expenses"] == "66.00"  # 37.50 + 12.50 + 16.00 — not 15032.50
    assert dashboard["total_income"] == "1000.00"
    assert dashboard["balance"] == "934.00"
    assert dashboard["top_spending_category"]["amount"] == "50.00"
    [food_budget] = dashboard["budget_usage"]
    assert food_budget["spent_amount"] == "50.00"
    assert food_budget["remaining_amount"] == "-10.00"


@pytest.mark.django_db
def test_category_breakdown_and_monthly_trend_use_base_amounts(auth_client, mixed_month):
    categories = auth_client.get(reverse("analytics-categories"), SEP).json()["categories"]
    monthly = auth_client.get(reverse("analytics-monthly"), {"year": 2026}).json()["months"]

    assert {row["category_name"]: row["amount"] for row in categories} == {"Food": "50.00", "Transport": "16.00"}
    assert monthly[8]["expenses"] == "66.00"


@pytest.mark.django_db
def test_comparison_and_insights_use_base_amounts(auth_client, user, food_category, mixed_month):
    _tx(user, food_category, "8000", currency="HUF", rate="0.0025", day=date(2026, 8, 10))  # 20.00 EUR

    comparison = auth_client.get(reverse("analytics-comparison"), SEP).json()
    insights = auth_client.get(reverse("analytics-insights"), SEP).json()["insights"]

    assert comparison["previous_month"]["total_expenses"] == "20.00"
    assert comparison["difference"]["total_expenses"] == "46.00"
    exceeded = next(insight for insight in insights if insight["type"] == "budget_exceeded")
    assert exceeded["amount"] == "10.00"


def _recurring(user, category, amount, currency="EUR"):
    return RecurringTransaction.objects.create(
        user=user, category=category, name=f"{amount} {currency}", type=category.type, amount=Decimal(amount),
        currency=currency, frequency=Frequency.MONTHLY, start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )


@pytest.mark.django_db
def test_recurring_commitments_convert_what_the_bill_says(user, food_category, add_rates, django_assert_num_queries):
    add_rates(date(2026, 8, 31), USD="1.25")  # the month's last day
    _recurring(user, food_category, "100.00")
    _recurring(user, food_category, "50.00", currency="USD")  # 40.00 EUR
    _recurring(user, food_category, "12.00", currency="GBP")  # no rate: can't be converted, left out

    with django_assert_num_queries(2):  # the templates + one for the rates
        total = services.get_recurring_monthly_expenses(user, 2026, 8, today=date(2026, 9, 15))

    assert total == Decimal("140.00")


@pytest.mark.django_db
def test_a_foreign_currency_template_accounts_for_its_own_payments(user, food_category):
    _recurring(user, food_category, "15.49", currency="USD")
    _tx(user, food_category, "15.49", currency="USD", rate="0.8547")  # the bill: fixed (13.24 EUR)
    _tx(user, food_category, "15.49")  # the same number in euros is something else

    result = patterns.get_spending_patterns(user, 2026, 9, today=date(2026, 10, 15))

    assert result["fixed_expenses"] == Decimal("13.24")
    assert result["variable_expenses"] == Decimal("15.49")
