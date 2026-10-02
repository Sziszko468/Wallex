from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.analytics import insights
from apps.analytics.insights import InsightType, Severity
from apps.budgets.models import Budget
from apps.categories.models import Category, TransactionType
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

# Selected month is September 2026; "today" is later, so both months are complete
# unless a test explicitly moves "today" into September.
YEAR, MONTH = 2026, 9
AFTER_SEPTEMBER = date(2026, 10, 15)


def _expense(user, category, amount, on):
    return Transaction.objects.create(
        user=user, category=category, type=TransactionType.EXPENSE, amount=Decimal(amount), date=on
    )


def _income(user, category, amount, on):
    return Transaction.objects.create(
        user=user, category=category, type=TransactionType.INCOME, amount=Decimal(amount), date=on
    )


def _recurring(user, category, amount, frequency, **extra):
    fields = {
        "user": user,
        "category": category,
        "name": f"{category.name} {frequency}",
        "type": category.type,
        "amount": Decimal(amount),
        "frequency": frequency,
        "start_date": date(2026, 1, 1),
        "next_occurrence_date": date(2026, 1, 1),
    }
    fields.update(extra)
    return RecurringTransaction.objects.create(**fields)


def _generate(user, today=AFTER_SEPTEMBER):
    return insights.generate_insights(user, YEAR, MONTH, today=today)


def _of_type(result, insight_type):
    return [insight for insight in result if insight.type == insight_type]


@pytest.fixture
def shopping_category(user):
    return Category.objects.create(user=user, name="Shopping", type=TransactionType.EXPENSE)


@pytest.mark.django_db
def test_no_data_produces_no_insights(user):
    assert _generate(user) == []


@pytest.mark.django_db
def test_top_category(user, food_category, transport_category):
    _expense(user, food_category, "300.00", date(2026, 9, 5))
    _expense(user, transport_category, "100.00", date(2026, 9, 6))

    [top] = _of_type(_generate(user), InsightType.TOP_CATEGORY)

    assert top.message == "Highest spending category is Food (75% of this month's expenses)."
    assert top.severity == Severity.INFO
    assert top.category_id == food_category.id
    assert top.amount == Decimal("300.00")
    assert top.percentage == Decimal("75.00")


@pytest.mark.django_db
def test_category_increase(user, food_category):
    _expense(user, food_category, "100.00", date(2026, 8, 10))
    _expense(user, food_category, "114.00", date(2026, 9, 10))

    [increase] = _of_type(_generate(user), InsightType.CATEGORY_INCREASE)

    assert increase.message == "Food spending increased by 14% compared to last month."
    assert increase.severity == Severity.WARNING
    assert increase.amount == Decimal("14.00")
    assert increase.percentage == Decimal("14.00")


@pytest.mark.django_db
def test_category_decrease(user, transport_category):
    _expense(user, transport_category, "200.00", date(2026, 8, 10))
    _expense(user, transport_category, "100.00", date(2026, 9, 10))

    [decrease] = _of_type(_generate(user), InsightType.CATEGORY_DECREASE)

    assert decrease.message == "Transport spending decreased by 50% compared to last month."
    assert decrease.severity == Severity.POSITIVE
    assert decrease.amount == Decimal("100.00")


@pytest.mark.django_db
def test_category_with_no_spending_this_month_counts_as_full_decrease(user, transport_category):
    _expense(user, transport_category, "80.00", date(2026, 8, 10))

    [decrease] = _of_type(_generate(user), InsightType.CATEGORY_DECREASE)

    assert decrease.percentage == Decimal("100.00")


@pytest.mark.django_db
def test_small_category_changes_are_ignored(user, food_category, transport_category):
    # +5%: below the relative threshold.
    _expense(user, food_category, "100.00", date(2026, 8, 10))
    _expense(user, food_category, "105.00", date(2026, 9, 10))
    # +40% but only 8.00 in absolute terms: below the amount threshold.
    _expense(user, transport_category, "20.00", date(2026, 8, 10))
    _expense(user, transport_category, "28.00", date(2026, 9, 10))

    result = _generate(user)

    assert _of_type(result, InsightType.CATEGORY_INCREASE) == []
    assert _of_type(result, InsightType.CATEGORY_DECREASE) == []


@pytest.mark.django_db
def test_category_without_previous_spending_is_not_compared(user, food_category):
    _expense(user, food_category, "500.00", date(2026, 9, 10))

    assert _of_type(_generate(user), InsightType.CATEGORY_INCREASE) == []


@pytest.mark.django_db
def test_only_the_largest_category_changes_are_reported(user):
    categories = [Category.objects.create(user=user, name=f"Cat {i}", type=TransactionType.EXPENSE) for i in range(5)]
    for i, category in enumerate(categories):
        _expense(user, category, "100.00", date(2026, 8, 10))
        _expense(user, category, str(Decimal("200.00") + i * 10), date(2026, 9, 10))

    increases = _of_type(_generate(user), InsightType.CATEGORY_INCREASE)

    assert len(increases) == insights.MAX_CATEGORY_CHANGE_INSIGHTS
    assert [insight.category_id for insight in increases] == [c.id for c in reversed(categories[2:])]


@pytest.mark.django_db
def test_current_month_is_compared_with_the_same_period_last_month(user, food_category):
    today = date(2026, 9, 10)
    _expense(user, food_category, "100.00", date(2026, 8, 5))
    # After day 10 of August: must not be part of the comparison.
    _expense(user, food_category, "500.00", date(2026, 8, 20))
    _expense(user, food_category, "200.00", date(2026, 9, 5))

    [increase] = _of_type(_generate(user, today=today), InsightType.CATEGORY_INCREASE)

    assert increase.percentage == Decimal("100.00")
    assert increase.message == "Food spending increased by 100% compared to the same period last month."


@pytest.mark.django_db
def test_month_to_date_cutoff_is_clamped_to_shorter_previous_month(user, food_category):
    # 31 March vs February (28 days): the whole of February is the comparison period.
    _expense(user, food_category, "100.00", date(2026, 2, 28))
    _expense(user, food_category, "100.00", date(2026, 3, 31))

    result = insights.generate_insights(user, 2026, 3, today=date(2026, 3, 31))

    assert _of_type(result, InsightType.CATEGORY_INCREASE) == []
    assert _of_type(result, InsightType.CATEGORY_DECREASE) == []


@pytest.mark.django_db
def test_budget_exceeded(user, shopping_category):
    Budget.objects.create(user=user, category=shopping_category, amount=Decimal("100.00"), year=YEAR, month=MONTH)
    _expense(user, shopping_category, "120.00", date(2026, 9, 10))

    [exceeded] = _of_type(_generate(user), InsightType.BUDGET_EXCEEDED)

    assert exceeded.message == "Shopping exceeded its budget by 20%."
    assert exceeded.severity == Severity.ALERT
    assert exceeded.amount == Decimal("20.00")
    assert exceeded.percentage == Decimal("120.00")


@pytest.mark.django_db
def test_overall_budget_exceeded(user, food_category):
    Budget.objects.create(user=user, category=None, amount=Decimal("200.00"), year=YEAR, month=MONTH)
    _expense(user, food_category, "250.00", date(2026, 9, 10))

    [exceeded] = _of_type(_generate(user), InsightType.BUDGET_EXCEEDED)

    assert exceeded.message == "Total spending exceeded the overall monthly budget by 25%."
    assert exceeded.category_id is None


@pytest.mark.django_db
def test_budget_close_to_limit_warns(user, shopping_category):
    Budget.objects.create(user=user, category=shopping_category, amount=Decimal("100.00"), year=YEAR, month=MONTH)
    _expense(user, shopping_category, "95.00", date(2026, 9, 10))

    result = _generate(user)

    assert _of_type(result, InsightType.BUDGET_EXCEEDED) == []
    [warning] = _of_type(result, InsightType.BUDGET_WARNING)
    assert warning.message == "You have used 95% of the Shopping budget."
    assert warning.amount == Decimal("5.00")


@pytest.mark.django_db
def test_budget_well_within_limit_has_no_insight(user, shopping_category):
    Budget.objects.create(user=user, category=shopping_category, amount=Decimal("100.00"), year=YEAR, month=MONTH)
    _expense(user, shopping_category, "50.00", date(2026, 9, 10))

    result = _generate(user)

    assert _of_type(result, InsightType.BUDGET_EXCEEDED) == []
    assert _of_type(result, InsightType.BUDGET_WARNING) == []


@pytest.mark.django_db
def test_recurring_share_normalizes_frequencies(user, food_category, salary_category):
    _income(user, salary_category, "1000.00", date(2026, 9, 1))
    _recurring(user, food_category, "400.00", Frequency.MONTHLY)
    _recurring(user, food_category, "30.00", Frequency.WEEKLY)  # 30 * 52 / 12 = 130.00
    _recurring(user, food_category, "120.00", Frequency.YEARLY)  # 120 / 12 = 10.00
    # None of these may count:
    _recurring(user, food_category, "999.00", Frequency.MONTHLY, is_active=False)
    _recurring(user, food_category, "999.00", Frequency.MONTHLY, end_date=date(2026, 8, 31))
    _recurring(user, food_category, "999.00", Frequency.MONTHLY, start_date=date(2026, 10, 1))
    _recurring(user, salary_category, "999.00", Frequency.MONTHLY)

    [share] = _of_type(_generate(user), InsightType.RECURRING_SHARE)

    assert share.amount == Decimal("540.00")
    assert share.percentage == Decimal("54.00")
    assert share.message == "Recurring expenses represent 54% of income."
    assert share.severity == Severity.WARNING


@pytest.mark.django_db
def test_low_recurring_share_is_informational(user, food_category, salary_category):
    _income(user, salary_category, "1000.00", date(2026, 9, 1))
    _recurring(user, food_category, "100.00", Frequency.MONTHLY)

    [share] = _of_type(_generate(user), InsightType.RECURRING_SHARE)

    assert share.severity == Severity.INFO


@pytest.mark.django_db
def test_recurring_share_needs_income(user, food_category):
    _recurring(user, food_category, "100.00", Frequency.MONTHLY)

    assert _of_type(_generate(user), InsightType.RECURRING_SHARE) == []


@pytest.mark.django_db
def test_overspending(user, food_category, salary_category):
    _income(user, salary_category, "1000.00", date(2026, 9, 1))
    _expense(user, food_category, "1200.00", date(2026, 9, 10))

    result = _generate(user)

    [overspending] = _of_type(result, InsightType.OVERSPENDING)
    assert overspending.message == "Expenses exceeded income by 20% this month."
    assert overspending.amount == Decimal("200.00")
    assert _of_type(result, InsightType.SAVINGS) == []


@pytest.mark.django_db
def test_savings(user, food_category, salary_category):
    _income(user, salary_category, "1000.00", date(2026, 9, 1))
    _expense(user, food_category, "750.00", date(2026, 9, 10))

    [savings] = _of_type(_generate(user), InsightType.SAVINGS)

    assert savings.message == "You saved 25% of your income this month."
    assert savings.severity == Severity.POSITIVE
    assert savings.amount == Decimal("250.00")


@pytest.mark.django_db
def test_insights_are_sorted_by_severity(user, food_category, shopping_category, salary_category):
    _income(user, salary_category, "100.00", date(2026, 9, 1))
    _expense(user, food_category, "100.00", date(2026, 8, 10))
    _expense(user, food_category, "50.00", date(2026, 9, 10))  # decrease -> positive
    _expense(user, shopping_category, "150.00", date(2026, 9, 10))  # top category -> info
    Budget.objects.create(user=user, category=shopping_category, amount=Decimal("100.00"), year=YEAR, month=MONTH)

    severities = [insight.severity for insight in _generate(user)]

    assert severities == sorted(severities, key=insights.SEVERITY_ORDER.__getitem__)
    assert severities[0] == Severity.ALERT
    assert severities[-1] == Severity.INFO


@pytest.mark.django_db
def test_other_users_data_is_ignored(user, other_user, food_category):
    other_food = Category.objects.create(user=other_user, name="Food", type=TransactionType.EXPENSE)
    _expense(other_user, other_food, "999.00", date(2026, 9, 10))

    assert _generate(user) == []


@pytest.mark.django_db
def test_query_count_is_constant(django_assert_num_queries, user, salary_category):
    _income(user, salary_category, "5000.00", date(2026, 9, 1))
    for i in range(5):
        category = Category.objects.create(user=user, name=f"Cat {i}", type=TransactionType.EXPENSE)
        Budget.objects.create(user=user, category=category, amount=Decimal("50.00"), year=YEAR, month=MONTH)
        _recurring(user, category, "10.00", Frequency.WEEKLY)
        for day in range(1, 6):
            _expense(user, category, "20.00", date(2026, 8, day))
            _expense(user, category, "30.00", date(2026, 9, day))

    with django_assert_num_queries(6):
        _generate(user)


# --- API -------------------------------------------------------------------


@pytest.mark.django_db
def test_insights_requires_authentication(api_client):
    response = api_client.get(reverse("analytics-insights"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_insights_endpoint_response_shape(auth_client, user, shopping_category):
    Budget.objects.create(user=user, category=shopping_category, amount=Decimal("100.00"), year=YEAR, month=MONTH)
    _expense(user, shopping_category, "120.00", date(2026, 9, 10))

    response = auth_client.get(reverse("analytics-insights"), {"year": YEAR, "month": MONTH})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["year"] == YEAR
    assert response.data["month"] == MONTH
    first = response.data["insights"][0]
    assert first == {
        "id": f"budget_exceeded:{Budget.objects.get().id}",
        "type": "budget_exceeded",
        "severity": "alert",
        "message": "Shopping exceeded its budget by 20%.",
        "category_id": shopping_category.id,
        "amount": "20.00",
        "percentage": 120.0,
    }


@pytest.mark.django_db
def test_insights_defaults_to_current_month(auth_client):
    today = timezone.now().date()

    response = auth_client.get(reverse("analytics-insights"))

    assert response.status_code == status.HTTP_200_OK
    assert (response.data["year"], response.data["month"]) == (today.year, today.month)
    assert response.data["insights"] == []


@pytest.mark.django_db
def test_insights_invalid_month_rejected(auth_client):
    response = auth_client.get(reverse("analytics-insights"), {"year": YEAR, "month": 13})
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "month" in response.data
