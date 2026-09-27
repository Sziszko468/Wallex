"""Savings goals: the status rule, progress figures, totals and moving money in and out."""

from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext

from apps.currencies.rates import Converter

from . import savings
from .models import SavingsGoal, SavingsGoalStatus

D = Decimal
TODAY = date(2026, 9, 27)


@pytest.fixture
def make_goal(user):
    """make_goal("Japan trip", "3000.00", "1850.00", currency="EUR", target_date=…): saved with a synced status."""

    def _make(name="Japan trip", target="3000.00", current="0.00", **fields):
        goal = SavingsGoal(user=user, name=name, target_amount=D(target), current_amount=D(current), **fields)
        goal.sync_status()
        goal.save()
        return goal

    return _make


def _figures(goal, user, today=TODAY):
    return savings.figures_of(goal, today, Converter(user.base_currency, today))


# --- Status ---------------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("current", "status", "expected"),
    [
        ("1850.00", SavingsGoalStatus.ACTIVE, SavingsGoalStatus.ACTIVE),
        ("3000.00", SavingsGoalStatus.ACTIVE, SavingsGoalStatus.COMPLETED),  # exactly the target
        ("3100.00", SavingsGoalStatus.ACTIVE, SavingsGoalStatus.COMPLETED),
        ("2999.99", SavingsGoalStatus.COMPLETED, SavingsGoalStatus.ACTIVE),  # dropped below it again
        ("3000.00", SavingsGoalStatus.ARCHIVED, SavingsGoalStatus.ARCHIVED),  # the user's choice wins
    ],
)
def test_status_follows_the_amounts(user, current, status, expected):
    goal = SavingsGoal(user=user, name="Trip", target_amount=D("3000.00"), current_amount=D(current), status=status)

    goal.sync_status()

    assert goal.status == expected


@pytest.mark.django_db
def test_the_database_rejects_a_negative_saved_amount(make_goal):
    goal = make_goal()

    with pytest.raises(IntegrityError), transaction.atomic():
        SavingsGoal.objects.filter(pk=goal.pk).update(current_amount=D("-1.00"))


@pytest.mark.django_db
def test_the_database_rejects_a_zero_target(user):
    with pytest.raises(IntegrityError), transaction.atomic():
        SavingsGoal.objects.create(user=user, name="Nothing", target_amount=D("0.00"))


# --- Figures ----------------------------------------------------------------------------------


@pytest.mark.django_db
def test_the_japan_trip_example(user, make_goal):
    goal = make_goal("Japan trip", "3000.00", "1850.00", target_date=date(2027, 4, 1))

    figures = _figures(goal, user)

    assert figures.progress_percentage == D("61.67")  # shown as 61.7 %
    assert figures.remaining_amount == D("1150.00")
    assert figures.days_left == 186
    assert figures.monthly_needed == D("191.67")  # 1150 over 6 whole months, rounded up
    assert (figures.base_current_amount, figures.base_target_amount) == (D("1850.00"), D("3000.00"))


@pytest.mark.django_db
def test_over_saving_shows_more_than_100_percent_and_nothing_remaining(user, make_goal):
    figures = _figures(make_goal(target="3000.00", current="3300.00"), user)

    assert figures.progress_percentage == D("110.00")
    assert figures.remaining_amount == D("0.00")


@pytest.mark.parametrize(
    ("start", "end", "months"),
    [
        (date(2026, 9, 27), date(2027, 3, 27), 6),
        (date(2026, 9, 27), date(2027, 3, 15), 5),  # the last month isn't complete
        (date(2026, 9, 27), date(2026, 10, 5), 0),
        (date(2026, 9, 27), date(2026, 9, 27), 0),
        (date(2026, 1, 31), date(2026, 3, 31), 2),
    ],
)
def test_full_months_between(start, end, months):
    assert savings.full_months_between(start, end) == months


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("fields", "expected"),
    [
        ({"target_date": date(2026, 10, 5)}, D("3000.00")),  # less than a month: everything now
        ({"target_date": date(2026, 12, 27)}, D("1000.00")),  # 3 months
        ({"target_date": None}, None),
        ({"target_date": date(2026, 9, 1)}, None),  # the date has passed
        ({"target_date": date(2027, 1, 1), "status": SavingsGoalStatus.ARCHIVED}, None),
    ],
)
def test_monthly_needed(make_goal, fields, expected):
    goal = make_goal(target="3000.00", **fields)

    assert savings.monthly_needed(goal, TODAY) == expected


@pytest.mark.django_db
def test_monthly_needed_is_rounded_up_to_the_currencys_unit(make_goal):
    forints = make_goal("Laptop", target="100000", currency="HUF", target_date=date(2026, 12, 27))  # 3 months
    euros = make_goal("Bike", target="100.00", target_date=date(2026, 12, 27))

    assert savings.monthly_needed(forints, TODAY) == D("33334")  # 33333.33… → whole forints, up
    assert savings.monthly_needed(euros, TODAY) == D("33.34")


@pytest.mark.django_db
def test_a_completed_goal_needs_nothing_more(make_goal):
    goal = make_goal(target="100.00", current="100.00", target_date=date(2027, 1, 1))

    assert goal.status == SavingsGoalStatus.COMPLETED
    assert savings.monthly_needed(goal, TODAY) is None


@pytest.mark.django_db
def test_days_left_is_negative_once_the_date_has_passed(user, make_goal):
    assert _figures(make_goal(target_date=date(2026, 9, 20)), user).days_left == -7
    assert _figures(make_goal(target_date=None), user).days_left is None


@pytest.mark.django_db
def test_base_values_use_the_latest_rate(user, make_goal, add_rates):
    add_rates(date(2026, 9, 25), USD="1.25")
    goal = make_goal("New York", target="5000.00", current="1250.00", currency="USD")

    figures = _figures(goal, user)

    assert (figures.base_current_amount, figures.base_target_amount) == (D("1000.00"), D("4000.00"))
    assert figures.progress_percentage == D("25.00")  # progress never depends on a rate


@pytest.mark.django_db
def test_without_a_recent_rate_the_base_values_are_unknown(user, make_goal):
    figures = _figures(make_goal(currency="GBP"), user)

    assert (figures.base_current_amount, figures.base_target_amount) == (None, None)


# --- Summary ----------------------------------------------------------------------------------


@pytest.mark.django_db
def test_summary_totals_skip_archived_goals(user, make_goal):
    make_goal("Japan trip", "3000.00", "1850.00")
    make_goal("Emergency fund", "2500.00", "2500.00")  # completed
    make_goal("Old plan", "900.00", "300.00", status=SavingsGoalStatus.ARCHIVED)

    summary = savings.get_summary(user, TODAY)

    assert (summary["active_count"], summary["completed_count"], summary["archived_count"]) == (1, 1, 1)
    assert (summary["total_saved"], summary["total_target"]) == (D("4350.00"), D("5500.00"))
    assert summary["progress_percentage"] == D("79.09")
    assert summary["currency"] == "EUR"


@pytest.mark.django_db
def test_summary_converts_other_currencies_or_reports_them(user, make_goal, add_rates):
    add_rates(date(2026, 9, 25), HUF="400")
    make_goal("Trip", "1000.00", "500.00")
    make_goal("Laptop", "400000", "200000", currency="HUF")  # 1000 / 500 EUR
    make_goal("London", "800.00", "100.00", currency="GBP")  # no GBP rate

    summary = savings.get_summary(user, TODAY)

    assert (summary["total_saved"], summary["total_target"]) == (D("1000.00"), D("2000.00"))
    assert summary["unconverted_currencies"] == ["GBP"]


@pytest.mark.django_db
def test_empty_summary(user):
    summary = savings.get_summary(user, TODAY)

    assert (summary["total_saved"], summary["total_target"], summary["progress_percentage"]) == (D("0"), D("0"), None)


@pytest.mark.django_db
def test_summary_is_one_query_plus_one_for_rates(user, make_goal, add_rates, django_assert_num_queries):
    for index in range(5):
        make_goal(f"Goal {index}")

    with django_assert_num_queries(1):
        savings.get_summary(user, TODAY)

    add_rates(date(2026, 9, 25), USD="1.25")
    make_goal("New York", currency="USD")
    with django_assert_num_queries(2):
        savings.get_summary(user, TODAY)


# --- Moving money ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_deposits_and_withdrawals_add_up_exactly(make_goal):
    goal = make_goal(target="3000.00", current="1850.00")

    savings.move_money(goal.pk, D("0.10"), savings.Direction.DEPOSIT)
    savings.move_money(goal.pk, D("0.20"), savings.Direction.DEPOSIT)
    goal = savings.move_money(goal.pk, D("50.30"), savings.Direction.WITHDRAWAL)

    goal.refresh_from_db()
    assert goal.current_amount == D("1800.00")


@pytest.mark.django_db
def test_reaching_the_target_completes_the_goal_and_withdrawing_reopens_it(make_goal):
    goal = make_goal(target="3000.00", current="2900.00")

    assert savings.move_money(goal.pk, D("100.00"), savings.Direction.DEPOSIT).status == SavingsGoalStatus.COMPLETED
    assert savings.move_money(goal.pk, D("0.01"), savings.Direction.WITHDRAWAL).status == SavingsGoalStatus.ACTIVE


@pytest.mark.django_db
def test_everything_saved_can_be_withdrawn_but_not_more(make_goal):
    goal = make_goal(current="150.00")

    with pytest.raises(savings.MoneyMovementError, match="You can't remove more than the 150.00 EUR saved."):
        savings.move_money(goal.pk, D("150.01"), savings.Direction.WITHDRAWAL)
    assert savings.move_money(goal.pk, D("150.00"), savings.Direction.WITHDRAWAL).current_amount == D("0.00")


@pytest.mark.django_db
def test_an_archived_goal_takes_no_money(make_goal):
    goal = make_goal(current="100.00", status=SavingsGoalStatus.ARCHIVED)

    for direction in savings.Direction:
        with pytest.raises(savings.MoneyMovementError) as error:
            savings.move_money(goal.pk, D("1.00"), direction)
        assert error.value.field == "non_field_errors"
    goal.refresh_from_db()
    assert goal.current_amount == D("100.00")


@pytest.mark.django_db
def test_the_saved_amount_cannot_outgrow_its_column(make_goal):
    goal = make_goal(target="9999999999.99", current="9999999999.00")

    with pytest.raises(savings.MoneyMovementError, match="too large"):
        savings.move_money(goal.pk, D("1.00"), savings.Direction.DEPOSIT)


@pytest.mark.django_db
def test_the_goal_row_is_locked_while_the_money_moves(make_goal):
    goal = make_goal()

    with CaptureQueriesContext(connection) as queries:
        savings.move_money(goal.pk, D("5.00"), savings.Direction.DEPOSIT)

    [read] = [query["sql"] for query in queries.captured_queries if query["sql"].startswith("SELECT")]
    assert read.endswith("FOR UPDATE")
