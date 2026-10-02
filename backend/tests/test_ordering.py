"""The order every list is returned in.

Lists are read by people (newest first, soonest first, biggest first) and paginated by clients, so
the order is part of the contract: it has to be what the docs say, stay the same when two rows
tie (a total order — otherwise a row can appear on two pages or on none) and never leak another
user's rows between yours.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.analytics.insights import SEVERITY_ORDER
from apps.budgets.models import Budget, SavingsGoal, SavingsGoalStatus
from apps.categories.models import Category, TransactionType
from apps.notifications.models import Notification, NotificationKind
from apps.subscriptions.models import Subscription
from apps.transactions.models import Frequency, Transaction
from apps.users.models import UserSession

D = Decimal
NOW = timezone.now()


def _rows(response):
    """A list endpoint's rows, paginated or not."""
    assert response.status_code == status.HTTP_200_OK, response.content
    data = response.json()
    return data["results"] if isinstance(data, dict) and "results" in data else data


def _names(response, key="name"):
    return [row[key] for row in _rows(response)]


def _category(user, name, type_=TransactionType.EXPENSE):
    return Category.objects.create(user=user, name=name, type=type_)


def _expense(user, category, amount, on, **extra):
    return Transaction.objects.create(
        user=user, category=category, type=TransactionType.EXPENSE, amount=D(amount), date=on, **extra
    )


@pytest.fixture
def food(user):
    return _category(user, "Food")


# =============================== transactions ===================================================


@pytest.mark.django_db
def test_transactions_come_newest_day_first_by_default(auth_client, user, food):
    for day in (date(2026, 9, 3), date(2026, 9, 20), date(2026, 9, 11)):
        _expense(user, food, "5.00", day)

    dates = _names(auth_client.get(reverse("transaction-list")), "date")

    assert dates == ["2026-09-20", "2026-09-11", "2026-09-03"]


@pytest.mark.django_db
def test_on_the_same_day_the_last_entered_comes_first(auth_client, user, food):
    first = _expense(user, food, "1.00", date(2026, 9, 3), description="first")
    second = _expense(user, food, "2.00", date(2026, 9, 3), description="second")
    third = _expense(user, food, "3.00", date(2026, 9, 3), description="third")

    descriptions = _names(auth_client.get(reverse("transaction-list")), "description")

    assert descriptions == ["third", "second", "first"]
    assert {first.pk, second.pk, third.pk} == {row["id"] for row in _rows(auth_client.get(reverse("transaction-list")))}


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("ordering", "expected"),
    [
        ("date", ["2026-09-03", "2026-09-11", "2026-09-20"]),
        ("-date", ["2026-09-20", "2026-09-11", "2026-09-03"]),
    ],
)
def test_transactions_can_be_ordered_by_date_either_way(auth_client, user, food, ordering, expected):
    for day in (date(2026, 9, 11), date(2026, 9, 3), date(2026, 9, 20)):
        _expense(user, food, "5.00", day)

    response = auth_client.get(reverse("transaction-list"), {"ordering": ordering})

    assert _names(response, "date") == expected


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("ordering", "expected"),
    [("amount", ["5.00", "25.00", "50.00"]), ("-amount", ["50.00", "25.00", "5.00"])],
)
def test_transactions_can_be_ordered_by_amount_either_way(auth_client, user, food, ordering, expected):
    for amount in ("25.00", "5.00", "50.00"):
        _expense(user, food, amount, date(2026, 9, 3))

    response = auth_client.get(reverse("transaction-list"), {"ordering": ordering})

    assert _names(response, "amount") == expected


@pytest.mark.django_db
def test_equal_amounts_still_have_one_fixed_order(auth_client, user, food):
    for _ in range(6):
        _expense(user, food, "10.00", date(2026, 9, 3))
    url = reverse("transaction-list")

    first = [row["id"] for row in _rows(auth_client.get(url, {"ordering": "amount"}))]
    second = [row["id"] for row in _rows(auth_client.get(url, {"ordering": "amount"}))]

    assert first == second
    assert len(set(first)) == 6


@pytest.mark.django_db
def test_pages_of_tied_rows_never_repeat_or_skip_one(auth_client, user, food):
    ids = {_expense(user, food, "10.00", date(2026, 9, 3)).pk for _ in range(7)}
    seen = []

    for page in (1, 2, 3, 4):
        response = auth_client.get(reverse("transaction-list"), {"ordering": "amount", "page_size": 2, "page": page})
        seen += [row["id"] for row in _rows(response)]

    assert sorted(seen) == sorted(ids)


@pytest.mark.django_db
@pytest.mark.parametrize("ordering", ["password", "user__email", "-category__name", "", "amount;drop table"])
def test_an_ordering_the_api_does_not_offer_changes_nothing(auth_client, user, food, ordering):
    for day in (date(2026, 9, 3), date(2026, 9, 20)):
        _expense(user, food, "5.00", day)

    response = auth_client.get(reverse("transaction-list"), {"ordering": ordering})

    assert _names(response, "date") == ["2026-09-20", "2026-09-03"]


@pytest.mark.django_db
def test_ordering_and_filtering_work_together(auth_client, user, food):
    other = _category(user, "Pets")
    for amount, category in (("30.00", food), ("10.00", food), ("20.00", food), ("99.00", other)):
        _expense(user, category, amount, date(2026, 9, 3))

    response = auth_client.get(reverse("transaction-list"), {"category": food.pk, "ordering": "-amount"})

    assert _names(response, "amount") == ["30.00", "20.00", "10.00"]


@pytest.mark.django_db
def test_ordering_never_mixes_in_another_users_rows(auth_client, user, other_user, food):
    theirs = _category(other_user, "Food")
    _expense(user, food, "1.00", date(2026, 9, 3))
    _expense(other_user, theirs, "999.00", date(2026, 9, 4))

    response = auth_client.get(reverse("transaction-list"), {"ordering": "-amount"})

    assert _names(response, "amount") == ["1.00"]


# =============================== categories =====================================================


@pytest.mark.django_db
def test_categories_are_listed_alphabetically(auth_client, user):
    for name in ("Zoo", "Books", "Coffee", "Apples"):
        _category(user, name)

    assert _names(auth_client.get(reverse("category-list"))) == ["Apples", "Books", "Coffee", "Zoo"]


@pytest.mark.django_db
def test_the_same_name_as_income_and_expense_keeps_a_fixed_order(auth_client, user):
    _category(user, "Other", TransactionType.INCOME)
    _category(user, "Other", TransactionType.EXPENSE)
    url = reverse("category-list")

    first = [row["id"] for row in _rows(auth_client.get(url))]

    assert first == [row["id"] for row in _rows(auth_client.get(url))]


# =============================== budgets ========================================================


@pytest.mark.django_db
def test_budgets_come_newest_month_first(auth_client, user, food):
    for year, month in ((2026, 3), (2026, 11), (2025, 12), (2026, 7)):
        Budget.objects.create(user=user, category=food, amount=D("100.00"), year=year, month=month)

    rows = _rows(auth_client.get(reverse("budget-list")))

    assert [(row["year"], row["month"]) for row in rows] == [(2026, 11), (2026, 7), (2026, 3), (2025, 12)]


# =============================== savings goals ==================================================


@pytest.mark.django_db
def test_goals_active_first_then_completed_then_archived_nearest_deadline_first(auth_client, user):
    def goal(name, target_date, state=SavingsGoalStatus.ACTIVE):
        return SavingsGoal.objects.create(
            user=user, name=name, target_amount=D("100.00"), target_date=target_date, status=state
        )

    goal("Old", date(2026, 1, 1), SavingsGoalStatus.ARCHIVED)
    goal("Done", date(2026, 2, 1), SavingsGoalStatus.COMPLETED)
    goal("Gamma", date(2027, 6, 1))
    goal("Delta", None)
    goal("Beta", date(2026, 12, 1))
    goal("Alpha", date(2026, 12, 1))

    names = _names(auth_client.get(reverse("savingsgoal-list")))

    # same deadline: alphabetical; no deadline: after every dated goal of its group
    assert names == ["Alpha", "Beta", "Gamma", "Delta", "Done", "Old"]


@pytest.mark.django_db
def test_goals_without_a_deadline_are_listed_alphabetically_among_themselves(auth_client, user):
    for name in ("Zebra", "Mango", "Apple"):
        SavingsGoal.objects.create(user=user, name=name, target_amount=D("10.00"))

    assert _names(auth_client.get(reverse("savingsgoal-list"))) == ["Apple", "Mango", "Zebra"]


# =============================== subscriptions ==================================================


@pytest.mark.django_db
def test_subscriptions_active_first_then_alphabetical(auth_client, user):
    entertainment = _category(user, "Entertainment")

    def subscribe(name, active):
        Subscription.objects.create(
            user=user,
            category=entertainment,
            name=name,
            amount=D("5.00"),
            frequency=Frequency.MONTHLY,
            start_date=date(2026, 1, 1),
            next_occurrence_date=date(2026, 1, 1),
            is_active=active,
        )

    subscribe("Zed", True)
    subscribe("Alpha", False)
    subscribe("Mid", True)
    subscribe("Beta", False)

    assert _names(auth_client.get(reverse("subscription-list"))) == ["Mid", "Zed", "Alpha", "Beta"]


# =============================== notifications ==================================================


def _notification(user, key, created_at, **extra):
    row = Notification.objects.create(
        user=user, kind=NotificationKind.BUDGET_WARNING, title=key, body="x", dedupe_key=key, **extra
    )
    Notification.objects.filter(pk=row.pk).update(created_at=created_at)
    return row


@pytest.mark.django_db
def test_notifications_come_newest_first(auth_client, user):
    _notification(user, "old", NOW - timedelta(days=3))
    _notification(user, "new", NOW)
    _notification(user, "middle", NOW - timedelta(days=1))

    assert _names(auth_client.get(reverse("notification-list")), "title") == ["new", "middle", "old"]


@pytest.mark.django_db
def test_notifications_created_in_the_same_instant_keep_one_order(auth_client, user):
    for key in ("a", "b", "c"):
        _notification(user, key, NOW)
    url = reverse("notification-list")

    first = _names(auth_client.get(url), "title")

    assert first == ["c", "b", "a"]  # the later row first
    assert first == _names(auth_client.get(url), "title")


@pytest.mark.django_db
def test_reading_a_notification_does_not_move_it(auth_client, user):
    first = _notification(user, "first", NOW - timedelta(days=2))
    _notification(user, "second", NOW - timedelta(days=1))

    auth_client.patch(reverse("notification-detail", args=[first.pk]), {"is_read": True}, format="json")

    assert _names(auth_client.get(reverse("notification-list")), "title") == ["second", "first"]


# =============================== sessions and the security log ===================================


@pytest.mark.django_db
def test_sessions_come_most_recently_used_first(auth_client, user):
    from apps.users.sessions import start_session

    sessions = [start_session(user)[0] for _ in range(3)]
    for index, session in enumerate(sessions):
        UserSession.objects.filter(pk=session.pk).update(last_used_at=NOW - timedelta(hours=index))
    expected = [session.pk for session in sessions]  # index 0 was used most recently

    rows = _rows(auth_client.get(reverse("session-list")))

    listed = [row["id"] for row in rows if row["id"] in expected]
    assert listed == expected


@pytest.mark.django_db
def test_the_security_log_comes_newest_first(api_client, user):
    from conftest import _authenticated_client

    api_client.post(reverse("auth-login"), {"email": user.email, "password": "wrong password"}, format="json")
    api_client.post(reverse("auth-login"), {"email": user.email, "password": "testpass123"}, format="json")
    client = _authenticated_client(user)

    actions = [row["action"] for row in _rows(client.get(reverse("auth-security-events")))]

    assert actions.index("login_succeeded") < actions.index("login_failed")


# =============================== analytics ======================================================


@pytest.mark.django_db
def test_the_category_breakdown_starts_with_the_biggest(auth_client, user):
    for name, amount in (("Small", "10.00"), ("Large", "300.00"), ("Medium", "50.00")):
        _expense(user, _category(user, name), amount, date(2026, 9, 3))

    response = auth_client.get(reverse("analytics-categories"), {"year": 2026, "month": 9})

    assert [row["category_name"] for row in response.json()["categories"]] == ["Large", "Medium", "Small"]


@pytest.mark.django_db
def test_merchants_biggest_first_and_alphabetical_when_tied(auth_client, user, food):
    for merchant, amount in (
        ("Beta Shop", "40.00"),
        ("Alpha Shop", "40.00"),
        ("Gamma Shop", "90.00"),
        ("Delta Shop", "5.00"),
    ):
        _expense(user, food, amount, date(2026, 9, 3), description=merchant)

    response = auth_client.get(reverse("analytics-merchants"), {"year": 2026, "month": 9})

    assert [row["merchant"] for row in response.json()["merchants"]] == [
        "Gamma Shop",
        "Alpha Shop",
        "Beta Shop",
        "Delta Shop",
    ]


@pytest.mark.django_db
def test_the_months_of_a_year_run_from_january_to_december(auth_client, user, food):
    _expense(user, food, "1.00", date(2026, 12, 1))
    _expense(user, food, "1.00", date(2026, 1, 1))

    months = auth_client.get(reverse("analytics-monthly"), {"year": 2026}).json()["months"]

    assert [row["month"] for row in months] == list(range(1, 13))


@pytest.mark.django_db
def test_insights_most_serious_first(auth_client, user, food):
    salary = _category(user, "Salary", TransactionType.INCOME)
    Transaction.objects.create(
        user=user, category=salary, type=TransactionType.INCOME, amount=D("1000.00"), date=date(2026, 9, 1)
    )
    _expense(user, food, "1200.00", date(2026, 9, 10))
    Budget.objects.create(user=user, category=food, amount=D("100.00"), year=2026, month=9)

    insights = auth_client.get(reverse("analytics-insights"), {"year": 2026, "month": 9}).json()["insights"]
    ranks = [SEVERITY_ORDER[item["severity"]] for item in insights]

    assert len(ranks) >= 2
    assert ranks == sorted(ranks)


@pytest.mark.django_db
def test_achievements_follow_the_catalog_order(auth_client):
    from apps.analytics.models import Achievement

    codes = [row["code"] for row in _rows(auth_client.get(reverse("achievement-list")))]

    assert codes == list(Achievement.objects.order_by("sort_order", "id").values_list("code", flat=True))


@pytest.mark.django_db
def test_the_default_categories_are_alphabetical_in_the_language_they_are_shown_in(auth_client, user):
    from apps.categories.defaults import create_default_categories

    create_default_categories(user)

    english = _names(auth_client.get(reverse("category-list"), HTTP_ACCEPT_LANGUAGE="en"))
    hungarian = _names(auth_client.get(reverse("category-list"), HTTP_ACCEPT_LANGUAGE="hu"))

    assert english == sorted(english)
    assert hungarian == [
        "Egészség",
        "Egyéb",
        "Élelmiszer",
        "Fizetés",
        "Közlekedés",
        "Lakhatás",
        "Számlák",
        "Szórakozás",
        "Utazás",
        "Vásárlás",
    ]


@pytest.mark.django_db
def test_category_order_ignores_case(auth_client, user):
    for name in ("banana", "Cherry", "apple"):
        _category(user, name)

    assert _names(auth_client.get(reverse("category-list"))) == ["apple", "banana", "Cherry"]
