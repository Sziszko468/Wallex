"""/api/savings-goals/ — CRUD, adding and removing money, and the summary."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from .models import SavingsGoal, SavingsGoalStatus

D = Decimal
LIST = reverse("savingsgoal-list")
SUMMARY = reverse("savingsgoal-summary")
TODAY = timezone.localdate()
NEXT_YEAR = (TODAY + timedelta(days=365)).isoformat()


def _detail(goal) -> str:
    return reverse("savingsgoal-detail", args=[goal.pk])


def _deposit(client, goal, amount):
    return client.post(reverse("savingsgoal-deposit", args=[goal.pk]), {"amount": amount}, format="json")


def _withdraw(client, goal, amount):
    return client.post(reverse("savingsgoal-withdraw", args=[goal.pk]), {"amount": amount}, format="json")


@pytest.fixture
def make_goal(user):
    def _make(name="Japan trip", target="3000.00", current="0.00", owner=None, **fields):
        goal = SavingsGoal(user=owner or user, name=name, target_amount=D(target), current_amount=D(current), **fields)
        goal.sync_status()
        goal.save()
        return goal

    return _make


# --- Create -------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_create_the_japan_trip(auth_client, user):
    response = auth_client.post(
        LIST,
        {"name": "Japan trip", "target_amount": "3000.00", "current_amount": "1850.00", "target_date": NEXT_YEAR},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert set(data) == {
        "id",
        "name",
        "currency",
        "target_amount",
        "current_amount",
        "target_date",
        "status",
        "progress_percentage",
        "remaining_amount",
        "days_left",
        "monthly_needed",
        "base_current_amount",
        "base_target_amount",
        "created_at",
        "updated_at",
    }
    assert (data["currency"], data["status"]) == ("EUR", "active")
    assert (data["target_amount"], data["current_amount"], data["remaining_amount"]) == (
        "3000.00",
        "1850.00",
        "1150.00",
    )
    assert data["progress_percentage"] == 61.67
    assert data["days_left"] == 365
    assert data["monthly_needed"] == "95.84"  # 1150 over 12 months, rounded up
    assert (data["base_current_amount"], data["base_target_amount"]) == ("1850.00", "3000.00")
    assert SavingsGoal.objects.get(pk=data["id"]).user == user


@pytest.mark.django_db
def test_minimal_goal_defaults(auth_client):
    data = auth_client.post(LIST, {"name": "Rainy day", "target_amount": "500"}, format="json").json()

    assert (data["current_amount"], data["target_date"], data["progress_percentage"]) == ("0.00", None, 0.0)
    assert (data["days_left"], data["monthly_needed"]) == (None, None)


@pytest.mark.django_db
def test_the_currency_defaults_to_the_base_currency(auth_client, user):
    user.base_currency = "HUF"
    user.save(update_fields=["base_currency"])

    data = auth_client.post(LIST, {"name": "Laptop", "target_amount": "650000"}, format="json").json()

    assert data["currency"] == "HUF"


@pytest.mark.django_db
def test_a_goal_in_another_currency_shows_its_base_values(auth_client, add_rates):
    add_rates(TODAY - timedelta(days=1), USD="1.25")

    data = auth_client.post(
        LIST,
        {"name": "New York", "currency": "USD", "target_amount": "5000.00", "current_amount": "1250.00"},
        format="json",
    ).json()

    assert (data["currency"], data["target_amount"]) == ("USD", "5000.00")  # as saved, never converted
    assert (data["base_current_amount"], data["base_target_amount"]) == ("1000.00", "4000.00")


@pytest.mark.django_db
def test_a_goal_created_already_reached_is_completed(auth_client):
    data = auth_client.post(
        LIST, {"name": "Done", "target_amount": "100", "current_amount": "100"}, format="json"
    ).json()

    assert data["status"] == "completed"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("changes", "field", "message"),
    [
        ({"target_amount": "0"}, "target_amount", "Ensure this value is greater than or equal to 0.01."),
        ({"target_amount": "1.005"}, "target_amount", "Ensure that there are no more than 2 decimal places."),
        ({"current_amount": "-1"}, "current_amount", "Ensure this value is greater than or equal to 0.00."),
        ({"currency": "HUF", "target_amount": "650000.50"}, "target_amount", "HUF amounts can't have decimals."),
        ({"currency": "JPY", "current_amount": "10.5"}, "current_amount", "JPY amounts can't have decimals."),
        ({"currency": "XYZ"}, "currency", '"XYZ" is not a valid choice.'),
        ({"target_date": "2020-01-01"}, "target_date", "The target date can't be in the past."),
        (
            {"status": "completed"},
            "status",
            "A goal is completed automatically when the saved amount reaches the target.",
        ),
        ({"name": ""}, "name", "This field may not be blank."),
        ({"name": "x" * 101}, "name", "Ensure this field has no more than 100 characters."),
    ],
)
def test_invalid_input_is_rejected(auth_client, changes, field, message):
    body = {"name": "Trip", "target_amount": "3000.00", **changes}

    response = auth_client.post(LIST, body, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()[field] == [message]
    assert not SavingsGoal.objects.exists()


@pytest.mark.django_db
def test_required_fields(auth_client):
    response = auth_client.post(LIST, {}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert set(response.json()) == {"name", "target_amount"}


@pytest.mark.django_db
def test_a_goal_can_be_created_archived(auth_client):
    data = auth_client.post(LIST, {"name": "Later", "target_amount": "10", "status": "archived"}, format="json").json()

    assert data["status"] == "archived"


# --- Read -----------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_list_shows_own_goals_active_first_nearest_date_first(auth_client, make_goal, other_user):
    make_goal("No deadline")
    make_goal("Later", target_date=TODAY + timedelta(days=200))
    make_goal("Sooner", target_date=TODAY + timedelta(days=20))
    make_goal("Done", target="10.00", current="10.00")
    make_goal("Archived", status=SavingsGoalStatus.ARCHIVED, target_date=TODAY + timedelta(days=1))
    make_goal("Theirs", owner=other_user)

    names = [goal["name"] for goal in auth_client.get(LIST).json()]

    assert names == ["Sooner", "Later", "No deadline", "Done", "Archived"]


@pytest.mark.django_db
def test_list_query_count_is_constant(auth_client, make_goal, django_assert_max_num_queries):
    for index in range(10):
        make_goal(f"Goal {index}")

    with django_assert_max_num_queries(2):  # the user + the goals, never one per goal
        assert len(auth_client.get(LIST).json()) == 10


@pytest.mark.django_db
def test_detail(auth_client, make_goal):
    goal = make_goal("Japan trip", "3000.00", "1850.00")

    data = auth_client.get(_detail(goal)).json()

    assert (data["name"], data["progress_percentage"]) == ("Japan trip", 61.67)


@pytest.mark.django_db
def test_another_users_goal_is_not_found(auth_client, make_goal, other_user):
    theirs = make_goal("Theirs", current="100.00", owner=other_user)

    assert auth_client.get(_detail(theirs)).status_code == status.HTTP_404_NOT_FOUND
    assert auth_client.patch(_detail(theirs), {"name": "Mine"}, format="json").status_code == 404
    assert auth_client.delete(_detail(theirs)).status_code == 404
    assert _deposit(auth_client, theirs, "1.00").status_code == 404
    assert _withdraw(auth_client, theirs, "100.00").status_code == 404
    theirs.refresh_from_db()
    assert (theirs.name, theirs.current_amount) == ("Theirs", D("100.00"))


# --- Update / delete ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_raising_the_target_reopens_a_completed_goal(auth_client, make_goal):
    goal = make_goal(target="100.00", current="100.00")

    data = auth_client.patch(_detail(goal), {"target_amount": "150.00"}, format="json").json()

    assert (data["status"], data["remaining_amount"]) == ("active", "50.00")


@pytest.mark.django_db
def test_setting_the_saved_amount_directly(auth_client, make_goal):
    goal = make_goal(target="3000.00", current="1850.00")

    data = auth_client.patch(_detail(goal), {"current_amount": "3000.00"}, format="json").json()

    assert (data["current_amount"], data["status"]) == ("3000.00", "completed")


@pytest.mark.django_db
def test_archive_and_restore(auth_client, make_goal):
    goal = make_goal(target="100.00", current="100.00")

    assert auth_client.patch(_detail(goal), {"status": "archived"}, format="json").json()["status"] == "archived"
    # Restoring answers with the status the amounts dictate: this one had reached its target.
    assert auth_client.patch(_detail(goal), {"status": "active"}, format="json").json()["status"] == "completed"


@pytest.mark.django_db
def test_the_currency_can_change_only_while_nothing_is_saved(auth_client, make_goal):
    empty = make_goal("Empty")
    funded = make_goal("Funded", current="10.00")

    assert auth_client.patch(_detail(empty), {"currency": "USD"}, format="json").json()["currency"] == "USD"
    response = auth_client.patch(_detail(funded), {"currency": "USD"}, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"currency": ["The currency can't change once money is saved in the goal."]}


@pytest.mark.django_db
def test_changing_the_currency_checks_the_amounts(auth_client, make_goal):
    goal = make_goal(target="999.99")

    response = auth_client.patch(_detail(goal), {"currency": "HUF"}, format="json")

    assert response.json() == {"target_amount": ["HUF amounts can't have decimals."]}


@pytest.mark.django_db
def test_a_goal_past_its_date_can_still_be_edited(auth_client, make_goal):
    goal = make_goal(target_date=date(2026, 1, 1))

    response = auth_client.patch(_detail(goal), {"name": "Japan trip 2027", "target_date": "2026-01-01"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["days_left"] < 0


@pytest.mark.django_db
def test_put_is_not_supported(auth_client, make_goal):
    goal = make_goal()

    assert auth_client.put(_detail(goal), {"name": "x", "target_amount": "1"}, format="json").status_code == 405


@pytest.mark.django_db
def test_delete(auth_client, make_goal):
    goal = make_goal(current="500.00")

    assert auth_client.delete(_detail(goal)).status_code == status.HTTP_204_NO_CONTENT
    assert not SavingsGoal.objects.filter(pk=goal.pk).exists()


@pytest.mark.django_db
def test_owner_cannot_be_reassigned(auth_client, make_goal, user, other_user):
    goal = make_goal()

    auth_client.patch(_detail(goal), {"user": other_user.pk}, format="json")

    goal.refresh_from_db()
    assert goal.user == user


# --- Adding and removing money --------------------------------------------------------------------


@pytest.mark.django_db
def test_add_money(auth_client, make_goal):
    goal = make_goal(target="3000.00", current="1850.00")

    response = _deposit(auth_client, goal, "200.00")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert (data["current_amount"], data["remaining_amount"], data["progress_percentage"]) == (
        "2050.00",
        "950.00",
        68.33,
    )


@pytest.mark.django_db
def test_add_money_until_the_goal_is_completed(auth_client, make_goal):
    goal = make_goal(target="3000.00", current="2900.00")

    assert _deposit(auth_client, goal, "150.00").json()["status"] == "completed"


@pytest.mark.django_db
def test_remove_money(auth_client, make_goal):
    goal = make_goal(target="100.00", current="100.00")

    data = _withdraw(auth_client, goal, "30.00").json()

    assert (data["current_amount"], data["status"]) == ("70.00", "active")


@pytest.mark.django_db
def test_cannot_remove_more_than_saved(auth_client, make_goal):
    goal = make_goal(current="150.00")

    response = _withdraw(auth_client, goal, "150.01")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"amount": ["You can't remove more than the 150.00 EUR saved."]}
    goal.refresh_from_db()
    assert goal.current_amount == D("150.00")


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("amount", "message"),
    [
        ("0", "Ensure this value is greater than or equal to 0.01."),
        ("-5", "Ensure this value is greater than or equal to 0.01."),
        ("1.005", "Ensure that there are no more than 2 decimal places."),
        ("abc", "A valid number is required."),
    ],
)
def test_invalid_amounts_move_nothing(auth_client, make_goal, amount, message):
    goal = make_goal(current="100.00")

    response = _deposit(auth_client, goal, amount)

    assert response.json() == {"amount": [message]}
    goal.refresh_from_db()
    assert goal.current_amount == D("100.00")


@pytest.mark.django_db
def test_amounts_follow_the_goals_currency(auth_client, make_goal):
    goal = make_goal("Laptop", target="650000", currency="HUF")

    assert _deposit(auth_client, goal, "1500.50").json() == {"amount": ["HUF amounts can't have decimals."]}
    assert _deposit(auth_client, goal, "15000").json()["current_amount"] == "15000.00"


@pytest.mark.django_db
def test_an_archived_goal_takes_no_money(auth_client, make_goal):
    goal = make_goal(current="100.00", status=SavingsGoalStatus.ARCHIVED)

    response = _deposit(auth_client, goal, "10.00")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"non_field_errors": ["This goal is archived. Restore it to add or remove money."]}


@pytest.mark.django_db
def test_missing_amount(auth_client, make_goal):
    assert _deposit(auth_client, make_goal(), None).json() == {"amount": ["This field may not be null."]}
    goal = make_goal("Other")
    response = auth_client.post(reverse("savingsgoal-deposit", args=[goal.pk]), {}, format="json")
    assert response.json() == {"amount": ["This field is required."]}


# --- Summary and the rest of the API --------------------------------------------------------------


@pytest.mark.django_db
def test_summary_endpoint(auth_client, make_goal):
    make_goal("Japan trip", "3000.00", "1850.00")
    make_goal("Emergency fund", "2500.00", "2500.00")
    make_goal("Old", "100.00", "50.00", status=SavingsGoalStatus.ARCHIVED)

    data = auth_client.get(SUMMARY).json()

    assert data == {
        "currency": "EUR",
        "active_count": 1,
        "completed_count": 1,
        "archived_count": 1,
        "total_saved": "4350.00",
        "total_target": "5500.00",
        "progress_percentage": 79.09,
        "unconverted_currencies": [],
    }


@pytest.mark.django_db
def test_empty_summary(auth_client):
    data = auth_client.get(SUMMARY).json()

    assert (data["total_saved"], data["total_target"], data["progress_percentage"]) == ("0.00", "0.00", None)


@pytest.mark.django_db
def test_changing_the_base_currency_keeps_the_goals_currency(auth_client, make_goal, add_rates):
    add_rates(TODAY, HUF="400")
    goal = make_goal("Japan trip", "3000.00", "1850.00")

    assert auth_client.patch(reverse("auth-me"), {"base_currency": "HUF"}, format="json").status_code == 200

    goal.refresh_from_db()
    assert (goal.currency, goal.current_amount, goal.target_amount) == ("EUR", D("1850.00"), D("3000.00"))
    summary = auth_client.get(SUMMARY).json()
    assert (summary["currency"], summary["total_saved"]) == ("HUF", "740000.00")  # 1850 × 400


@pytest.mark.django_db
def test_goals_are_not_transactions(auth_client, make_goal):
    goal = make_goal(target="3000.00")

    _deposit(auth_client, goal, "500.00")
    dashboard = auth_client.get(reverse("analytics-dashboard"), {"year": TODAY.year, "month": TODAY.month}).json()

    assert dashboard["total_expenses"] == "0.00"  # putting money aside isn't spending it
    assert auth_client.get(reverse("transaction-list")).json()["count"] == 0
