"""/api/achievements/ — the catalog with the user's progress, evaluated when read."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.budgets.models import Budget, SavingsGoal
from apps.transactions.models import Transaction

from .models import UserAchievement

LIST = reverse("achievement-list")
MARK_SEEN = reverse("achievement-mark-seen")
TODAY = timezone.localdate()


def _by_code(response) -> dict[str, dict]:
    return {item["code"]: item for item in response.json()}


@pytest.mark.django_db
def test_list_shape_and_order(auth_client):
    response = auth_client.get(LIST)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert [item["code"] for item in data] == [
        "first_transaction",
        "streak_7",
        "streak_30",
        "saved_100",
        "saved_1000",
        "goal_completed",
        "stayed_under_budget",
    ]
    assert set(data[0]) == {
        "code",
        "name",
        "title",
        "detail",
        "description",
        "icon",
        "category",
        "unit",
        "target",
        "target_currency",
        "progress",
        "progress_percentage",
        "unlocked",
        "unlocked_at",
        "is_new",
    }
    streak = data[1]
    assert (streak["icon"], streak["name"], streak["unit"], streak["target"]) == (
        "🔥",
        "7 Day Tracking Streak",
        "days",
        "7.00",
    )
    assert (streak["unlocked"], streak["unlocked_at"], streak["is_new"], streak["progress"]) == (
        False,
        None,
        False,
        "0.00",
    )


@pytest.mark.django_db
def test_recording_a_transaction_unlocks_first_transaction(auth_client, food_category):
    auth_client.post(
        reverse("transaction-list"),
        {"amount": "12.30", "type": "expense", "category": food_category.id, "date": TODAY.isoformat()},
        format="json",
    )

    first = _by_code(auth_client.get(LIST))["first_transaction"]

    assert (first["unlocked"], first["is_new"], first["progress_percentage"]) == (True, True, 100.0)
    assert first["unlocked_at"] is not None


@pytest.mark.django_db
def test_mark_seen_clears_is_new(auth_client, user, food_category):
    Transaction.objects.create(user=user, category=food_category, type="expense", amount=Decimal("1.00"), date=TODAY)
    auth_client.get(LIST)

    response = auth_client.post(MARK_SEEN)

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"marked": 1}
    assert _by_code(auth_client.get(LIST))["first_transaction"]["is_new"] is False
    assert auth_client.post(MARK_SEEN).json() == {"marked": 0}


@pytest.mark.django_db
def test_money_progress_is_a_decimal_string_in_the_target_currency(auth_client, user):
    SavingsGoal.objects.create(
        user=user, name="Trip", target_amount=Decimal("3000.00"), current_amount=Decimal("412.50")
    )

    saved = _by_code(auth_client.get(LIST))["saved_1000"]

    assert (saved["progress"], saved["target"], saved["target_currency"]) == ("412.50", "1000.00", "EUR")
    assert saved["progress_percentage"] == 41.25


@pytest.mark.django_db
def test_stayed_under_budget_is_personalized(auth_client, user, food_category):
    last_month = TODAY.replace(day=1) - timedelta(days=1)
    Budget.objects.create(
        user=user, category=food_category, amount=Decimal("100.00"), year=last_month.year, month=last_month.month
    )
    Transaction.objects.create(
        user=user, category=food_category, type="expense", amount=Decimal("80.00"), date=last_month
    )

    budget = _by_code(auth_client.get(LIST))["stayed_under_budget"]

    assert (budget["name"], budget["title"]) == ("Stayed Under Budget", "Stayed Under Food Budget")
    assert budget["detail"] == last_month.strftime("%B %Y")


@pytest.mark.django_db
def test_locked_achievements_have_no_detail(auth_client):
    budget = _by_code(auth_client.get(LIST))["stayed_under_budget"]

    assert (budget["title"], budget["detail"]) == ("Stayed Under Budget", None)


@pytest.mark.django_db
def test_each_user_sees_only_their_own_progress(auth_client, other_auth_client, other_user, food_category):
    Transaction.objects.create(
        user=other_user, category=food_category, type="expense", amount=Decimal("1.00"), date=TODAY
    )

    mine = _by_code(auth_client.get(LIST))
    theirs = _by_code(other_auth_client.get(LIST))

    assert mine["first_transaction"]["unlocked"] is False
    assert theirs["first_transaction"]["unlocked"] is True
    assert other_auth_client.post(MARK_SEEN).json() == {"marked": 1}
    assert UserAchievement.objects.filter(seen_at__isnull=False).get().user == other_user


@pytest.mark.django_db
def test_reading_twice_keeps_the_unlock_time(auth_client, user, food_category):
    Transaction.objects.create(
        user=user, category=food_category, type="expense", amount=Decimal("1.00"), date=date(2026, 1, 5)
    )

    first = _by_code(auth_client.get(LIST))["first_transaction"]["unlocked_at"]
    second = _by_code(auth_client.get(LIST))["first_transaction"]["unlocked_at"]

    assert first == second


@pytest.mark.django_db
def test_only_get_and_mark_seen_exist(auth_client):
    assert auth_client.post(LIST, {}, format="json").status_code == status.HTTP_405_METHOD_NOT_ALLOWED
    assert auth_client.get(MARK_SEEN).status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.django_db
def test_anonymous_requests_are_refused(api_client):
    assert api_client.get(LIST).status_code == status.HTTP_401_UNAUTHORIZED
    assert api_client.post(MARK_SEEN).status_code == status.HTTP_401_UNAUTHORIZED
