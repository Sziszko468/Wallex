"""Achievements: the catalog, each rule, and how evaluate() stores progress and unlocks."""

from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.budgets.models import Budget, SavingsGoal, SavingsGoalStatus
from apps.transactions.models import Transaction

from . import achievements
from .models import Achievement, AchievementRule, UserAchievement

D = Decimal
TODAY = date(2026, 9, 27)


def _recorded(user, category, on: date, *, booked: date | None = None, amount="10.00"):
    """A transaction recorded (created_at) on `on`, booked on `booked` (default: the same day)."""
    tx = Transaction.objects.create(
        user=user, category=category, type=category.type, amount=D(amount), date=booked or on
    )
    Transaction.objects.filter(pk=tx.pk).update(created_at=datetime.combine(on, time(12), tzinfo=dt_timezone.utc))
    return tx


def _goal(user, current, target="3000.00", **fields):
    goal = SavingsGoal(user=user, name=fields.pop("name", "Japan trip"), target_amount=D(target), current_amount=D(current), **fields)
    goal.sync_status()
    goal.save()
    return goal


def _evaluate(user, today=TODAY) -> dict[str, UserAchievement]:
    return {record.achievement.code: record for record in achievements.evaluate(user, today)}


# --- Catalog ----------------------------------------------------------------------------------


@pytest.mark.django_db
def test_the_catalog_has_the_seven_achievements_in_order():
    assert list(Achievement.objects.values_list("code", flat=True)) == [
        "first_transaction", "streak_7", "streak_30", "saved_100", "saved_1000", "goal_completed", "stayed_under_budget",
    ]


@pytest.mark.django_db
def test_every_rule_has_an_evaluator():
    assert set(AchievementRule.values) == set(achievements.RULES)
    assert set(Achievement.objects.values_list("rule", flat=True)) <= set(achievements.RULES)


@pytest.mark.django_db
def test_a_new_user_has_everything_locked(user):
    records = _evaluate(user)

    assert len(records) == 7
    assert {record.is_unlocked for record in records.values()} == {False}
    assert {record.progress for record in records.values()} == {D("0.00")}
    assert UserAchievement.objects.filter(user=user).count() == 7  # stored for later (notifications)


# --- Streaks ----------------------------------------------------------------------------------


def _days(*offsets: int) -> list[date]:
    return [TODAY - timedelta(days=offset) for offset in sorted(offsets, reverse=True)]


@pytest.mark.parametrize(
    ("days", "longest", "current"),
    [
        ([], 0, 0),
        (_days(0), 1, 1),
        (_days(6, 5, 4, 3, 2, 1, 0), 7, 7),
        (_days(3, 2, 1), 3, 3),  # ends yesterday: still alive, today isn't over
        (_days(4, 3, 2), 3, 0),  # ended the day before yesterday: broken
        (_days(20, 19, 18, 17, 1, 0), 4, 2),  # the longest run isn't the current one
    ],
)
def test_streaks(days, longest, current):
    assert achievements.longest_streak(days) == longest
    assert achievements.current_streak(days, TODAY) == current


@pytest.mark.django_db
def test_seven_days_in_a_row_unlock_the_7_day_streak(user, food_category):
    for offset in range(7):
        _recorded(user, food_category, TODAY - timedelta(days=offset))
        _recorded(user, food_category, TODAY - timedelta(days=offset))  # two on one day count once

    records = _evaluate(user)

    assert records["streak_7"].is_unlocked
    assert (records["streak_30"].is_unlocked, records["streak_30"].progress) == (False, D("7.00"))


@pytest.mark.django_db
def test_a_streak_counts_recording_days_not_booking_dates(user, food_category):
    for offset in range(7):
        _recorded(user, food_category, TODAY, booked=TODAY - timedelta(days=offset))  # a week entered at once

    records = _evaluate(user)

    assert (records["streak_7"].is_unlocked, records["streak_7"].progress) == (False, D("1.00"))


@pytest.mark.django_db
def test_an_unlocked_streak_stays_unlocked_when_the_streak_breaks(user, food_category):
    for offset in range(7):
        _recorded(user, food_category, TODAY - timedelta(days=offset))
    unlocked_at = _evaluate(user)["streak_7"].unlocked_at

    later = _evaluate(user, today=TODAY + timedelta(days=10))  # nothing recorded since

    assert later["streak_7"].unlocked_at == unlocked_at
    assert later["streak_7"].progress == D("7.00")
    assert later["streak_30"].progress == D("0.00")  # the current streak is gone


# --- First transaction ------------------------------------------------------------------------


@pytest.mark.django_db
def test_first_transaction(user, food_category):
    assert not _evaluate(user)["first_transaction"].is_unlocked

    _recorded(user, food_category, TODAY)

    record = _evaluate(user)["first_transaction"]
    assert (record.is_unlocked, record.progress) == (True, D("1.00"))


# --- Saved ------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_saved_money_is_the_savings_pages_total(user):
    _goal(user, "100.00", name="Trip")
    _goal(user, "50.00", name="Laptop")
    _goal(user, "900.00", name="Old", status=SavingsGoalStatus.ARCHIVED)  # not on the Savings page total

    records = _evaluate(user)

    assert records["saved_100"].is_unlocked
    assert (records["saved_1000"].is_unlocked, records["saved_1000"].progress) == (False, D("150.00"))


@pytest.mark.django_db
def test_saved_money_in_another_base_currency_is_converted_to_euros(user, add_rates):
    user.base_currency = "HUF"
    user.save(update_fields=["base_currency"])
    add_rates(date(2026, 9, 25), HUF="400")
    _goal(user, "200000", target="500000", currency="HUF")  # 500 EUR

    records = _evaluate(user)

    assert records["saved_100"].is_unlocked
    assert records["saved_1000"].progress == D("500.00")
    assert records["saved_1000"].achievement.target_currency == "EUR"


@pytest.mark.django_db
def test_without_an_exchange_rate_saved_progress_is_left_alone(user):
    user.base_currency = "HUF"
    user.save(update_fields=["base_currency"])
    _goal(user, "200000", target="500000", currency="HUF")

    records = _evaluate(user)  # no HUF rate at all

    assert (records["saved_100"].is_unlocked, records["saved_100"].progress) == (False, D("0.00"))


@pytest.mark.django_db
def test_withdrawing_later_keeps_the_saved_achievement(user):
    goal = _goal(user, "1200.00")
    assert _evaluate(user)["saved_1000"].is_unlocked

    SavingsGoal.objects.filter(pk=goal.pk).update(current_amount=D("10.00"))

    record = _evaluate(user)["saved_1000"]
    assert (record.is_unlocked, record.progress) == (True, D("1000.00"))  # frozen at the target


# --- Savings goal completed -------------------------------------------------------------------


@pytest.mark.django_db
def test_completing_a_savings_goal(user):
    _goal(user, "100.00", target="3000.00", name="Japan trip")
    assert not _evaluate(user)["goal_completed"].is_unlocked

    _goal(user, "500.00", target="500.00", name="Bike")

    record = _evaluate(user)["goal_completed"]
    assert record.is_unlocked
    assert achievements.title_and_detail(record) == ("Completed Savings Goal", "Bike")


@pytest.mark.django_db
def test_a_goal_archived_after_completion_still_counts(user):
    _goal(user, "500.00", target="500.00", name="Bike", status=SavingsGoalStatus.ARCHIVED)

    assert _evaluate(user)["goal_completed"].is_unlocked


# --- Stayed under budget ----------------------------------------------------------------------


@pytest.fixture
def august_food_budget(user, food_category):
    return Budget.objects.create(user=user, category=food_category, amount=D("100.00"), year=2026, month=8)


@pytest.mark.django_db
def test_a_finished_month_within_budget(user, food_category, august_food_budget):
    _recorded(user, food_category, date(2026, 8, 10), amount="80.00")

    record = _evaluate(user)["stayed_under_budget"]

    assert record.is_unlocked
    assert record.context == {"category_name": "Food", "year": 2026, "month": 8}
    assert achievements.title_and_detail(record) == ("Stayed Under Food Budget", "August 2026")


@pytest.mark.django_db
def test_exactly_the_limit_is_within_budget(user, food_category, august_food_budget):
    _recorded(user, food_category, date(2026, 8, 10), amount="100.00")

    assert _evaluate(user)["stayed_under_budget"].is_unlocked


@pytest.mark.django_db
def test_going_over_the_budget_earns_nothing(user, food_category, august_food_budget):
    _recorded(user, food_category, date(2026, 8, 10), amount="100.01")

    assert not _evaluate(user)["stayed_under_budget"].is_unlocked


@pytest.mark.django_db
def test_the_current_month_isnt_finished_yet(user, food_category):
    Budget.objects.create(user=user, category=food_category, amount=D("100.00"), year=2026, month=9)
    _recorded(user, food_category, date(2026, 9, 10), amount="5.00")

    assert not _evaluate(user)["stayed_under_budget"].is_unlocked


@pytest.mark.django_db
def test_a_month_without_tracked_expenses_earns_nothing(user, august_food_budget):
    assert not _evaluate(user)["stayed_under_budget"].is_unlocked


@pytest.mark.django_db
def test_an_overall_budget_and_the_latest_month_wins(user, food_category, transport_category, august_food_budget):
    Budget.objects.create(user=user, category=None, amount=D("500.00"), year=2026, month=7)
    _recorded(user, transport_category, date(2026, 7, 3), amount="120.00")
    _recorded(user, food_category, date(2026, 8, 3), amount="150.00")  # August's food budget was exceeded

    record = _evaluate(user)["stayed_under_budget"]

    assert achievements.title_and_detail(record) == ("Stayed Under Overall Budget", "July 2026")


# --- Evaluation --------------------------------------------------------------------------------


@pytest.mark.django_db
def test_evaluation_is_idempotent(user, food_category):
    _recorded(user, food_category, TODAY)
    first = _evaluate(user)["first_transaction"].unlocked_at

    with CaptureQueriesContext(connection) as queries:
        again = _evaluate(user)

    assert again["first_transaction"].unlocked_at == first
    writes = [q["sql"] for q in queries.captured_queries if q["sql"].startswith(("INSERT", "UPDATE"))]
    assert writes == []  # nothing changed, nothing written


@pytest.mark.django_db
def test_query_count_is_constant(user, food_category, django_assert_max_num_queries):
    for offset in range(40):
        _recorded(user, food_category, TODAY - timedelta(days=offset))
    for month in range(1, 9):
        Budget.objects.create(user=user, category=food_category, amount=D("500.00"), year=2026, month=month)
    for index in range(10):
        _goal(user, "100.00", name=f"Goal {index}")

    # catalog, tracking days, goals total, budgets, tracked months, completed goal, stored rows, writes
    with django_assert_max_num_queries(12):
        _evaluate(user)


@pytest.mark.django_db
def test_other_users_data_never_counts(user, other_user, food_category):
    _recorded(other_user, food_category, TODAY)
    _goal(other_user, "5000.00", target="5000.00")

    records = _evaluate(user)

    assert {record.is_unlocked for record in records.values()} == {False}


@pytest.mark.django_db
def test_mark_seen(user, food_category):
    _recorded(user, food_category, TODAY)
    _evaluate(user)

    assert achievements.mark_seen(user) == 1
    assert achievements.mark_seen(user) == 0
    assert UserAchievement.objects.get(user=user, achievement__code="first_transaction").seen_at is not None


@pytest.mark.django_db
def test_progress_percentage_is_capped_at_100(user):
    _goal(user, "412.50", name="Trip")

    records = _evaluate(user)

    assert achievements.progress_percentage(records["saved_1000"]) == 41.25
    assert achievements.progress_percentage(records["saved_100"]) == 100.0
