"""Every total is in the user's base currency: analytics add up base_amount, never amount."""

from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.budgets.models import Budget
from apps.transactions.models import Transaction

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
