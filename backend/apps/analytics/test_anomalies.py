"""Unusual spending detection (apps/analytics/anomalies.py)."""

from datetime import date
from decimal import Decimal

import pytest

from apps.categories.models import Category, TransactionType
from apps.transactions.models import Transaction

from .anomalies import UnusualSpending, baseline_months, find_unusual_spending

D = Decimal
TODAY = date(2026, 9, 15)
JUN, JUL, AUG = date(2026, 6, 1), date(2026, 7, 1), date(2026, 8, 1)


def _category(user, name):
    return Category.objects.create(user=user, name=name, type=TransactionType.EXPENSE)


def _expense(user, category, amount, on):
    Transaction.objects.create(user=user, category=category, type=TransactionType.EXPENSE, amount=D(amount), date=on)


@pytest.fixture
def shopping(user):
    return _category(user, "Shopping")


@pytest.fixture
def housing(user):
    return _category(user, "Housing")


@pytest.fixture
def usual_months(user, shopping, housing):
    """Three ordinary months: 100.00 of shopping on the 5th, rent of 500.00 on the 20th.
    Usual spending is 600.00 a month, so an increase must be at least 30.00 (5 %) to count."""
    for month in (JUN, JUL, AUG):
        _expense(user, shopping, "100.00", month.replace(day=5))
        _expense(user, housing, "500.00", month.replace(day=20))


def test_baseline_is_the_three_months_before():
    assert baseline_months(TODAY) == [AUG, JUL, JUN]
    assert baseline_months(date(2026, 2, 10)) == [date(2026, 1, 1), date(2025, 12, 1), date(2025, 11, 1)]


@pytest.mark.django_db
def test_category_clearly_above_usual_is_found(user, shopping, usual_months):
    _expense(user, shopping, "130.00", date(2026, 9, 5))

    assert find_unusual_spending(user, TODAY) == [
        UnusualSpending(shopping.id, "Shopping", D("130.00"), D("100.00"), D("30.00"))
    ]


@pytest.mark.django_db
def test_increase_below_20_percent_is_normal(user, shopping, usual_months):
    _expense(user, shopping, "119.00", date(2026, 9, 5))

    assert find_unusual_spending(user, TODAY) == []


@pytest.mark.django_db
def test_big_percentage_of_a_small_amount_is_normal(user, usual_months):
    coffee = _category(user, "Coffee")
    for month in (JUN, JUL, AUG):
        _expense(user, coffee, "10.00", month.replace(day=3))
    _expense(user, coffee, "25.00", date(2026, 9, 3))  # +150 %, but 15.00 is < 5 % of ~610.00 a month

    assert find_unusual_spending(user, TODAY) == []


@pytest.mark.django_db
def test_only_the_same_days_of_earlier_months_count(user, shopping, usual_months):
    for month in (JUN, JUL, AUG):
        _expense(user, shopping, "300.00", month.replace(day=25))  # after the 15th: not "usual by now"
    _expense(user, shopping, "150.00", date(2026, 9, 5))
    _expense(user, shopping, "999.00", date(2026, 9, 25))  # not happened yet

    [unusual] = find_unusual_spending(user, TODAY)

    # Against 400.00 (whole months) this would be a decrease; by the 15th, 100.00 is usual.
    assert (unusual.current_amount, unusual.usual_amount) == (D("150.00"), D("100.00"))


@pytest.mark.django_db
def test_months_before_tracking_started_are_not_a_baseline(user, shopping, housing):
    # Tracking started on 20 June: June's 1st–15th is empty because nothing was recorded yet,
    # not because nothing was spent. Averaging it in would make 100.00 look like 66.67.
    _expense(user, housing, "500.00", date(2026, 6, 20))
    for month in (JUL, AUG):
        _expense(user, shopping, "100.00", month.replace(day=5))
        _expense(user, housing, "500.00", month.replace(day=20))
    _expense(user, shopping, "118.00", date(2026, 9, 5))

    assert find_unusual_spending(user, TODAY) == []  # +18 % against 100.00, not +77 % against 66.67


@pytest.mark.django_db
def test_needs_two_months_of_history(user, shopping):
    _expense(user, shopping, "100.00", date(2026, 8, 5))
    _expense(user, shopping, "500.00", date(2026, 9, 5))

    assert find_unusual_spending(user, TODAY) == []


@pytest.mark.django_db
def test_a_new_kind_of_expense_is_not_unusual(user, usual_months):
    _expense(user, _category(user, "Travel"), "400.00", date(2026, 9, 10))

    assert find_unusual_spending(user, TODAY) == []


@pytest.mark.django_db
def test_largest_excess_first(user, shopping, usual_months):
    food = _category(user, "Food")
    for month in (JUN, JUL, AUG):
        _expense(user, food, "200.00", month.replace(day=10))
    _expense(user, shopping, "150.00", date(2026, 9, 5))  # +50.00
    _expense(user, food, "300.00", date(2026, 9, 10))  # +100.00

    assert [item.category_name for item in find_unusual_spending(user, TODAY)] == ["Food", "Shopping"]


@pytest.mark.django_db
def test_other_users_spending_is_ignored(user, other_user, shopping, usual_months):
    theirs = _category(other_user, "Shopping")
    _expense(other_user, theirs, "5000.00", date(2026, 9, 5))

    assert find_unusual_spending(user, TODAY) == []


@pytest.mark.django_db
def test_one_query(user, shopping, usual_months, django_assert_num_queries):
    _expense(user, shopping, "130.00", date(2026, 9, 5))

    with django_assert_num_queries(1):
        find_unusual_spending(user, TODAY)
