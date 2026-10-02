"""/api/subscriptions/ — and how subscriptions fit into the rest of the API."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.categories.models import Category, TransactionType
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

from .models import Subscription

D = Decimal
LIST = reverse("subscription-list")
SUMMARY = reverse("subscription-summary")


def _detail(subscription) -> str:
    return reverse("subscription-detail", args=[subscription.pk])


@pytest.fixture
def body(entertainment):
    return {
        "name": "Netflix",
        "merchant": "Netflix International B.V.",
        "amount": "17.99",
        "category": entertainment.id,
        "frequency": "monthly",
        "start_date": "2026-01-05",
    }


# --- Create -------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_create_returns_the_subscription_with_its_costs(auth_client, body, user):
    response = auth_client.post(LIST, body, format="json")

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert set(data) == {
        "id",
        "name",
        "merchant",
        "amount",
        "currency",
        "category",
        "frequency",
        "start_date",
        "end_date",
        "next_payment_date",
        "active",
        "status",
        "upcoming_payments",
        "monthly_cost",
        "yearly_cost",
        "base_monthly_cost",
        "base_yearly_cost",
        "description",
        "created_at",
        "updated_at",
    }
    assert (data["currency"], data["active"], data["status"]) == ("EUR", True, "active")
    assert (data["monthly_cost"], data["yearly_cost"]) == ("17.99", "215.88")
    assert (data["base_monthly_cost"], data["base_yearly_cost"]) == ("17.99", "215.88")
    assert data["next_payment_date"] == data["upcoming_payments"][0]
    assert len(data["upcoming_payments"]) == 3

    row = RecurringTransaction.objects.get(pk=data["id"])
    assert (row.user, row.type, row.is_subscription) == (user, TransactionType.EXPENSE, True)
    assert row.next_occurrence_date == date(2026, 1, 5)


@pytest.mark.django_db
def test_currency_defaults_to_the_base_currency(auth_client, body, user):
    user.base_currency = "HUF"
    user.save(update_fields=["base_currency"])

    response = auth_client.post(LIST, {**body, "amount": "4990"}, format="json")

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["currency"] == "HUF"


@pytest.mark.django_db
def test_a_subscription_billed_in_another_currency(auth_client, body, add_rates):
    add_rates(timezone.localdate() - timedelta(days=1), USD="1.25")

    data = auth_client.post(LIST, {**body, "amount": "15.49", "currency": "USD"}, format="json").json()

    assert (data["amount"], data["currency"], data["monthly_cost"]) == ("15.49", "USD", "15.49")
    assert data["base_monthly_cost"] == "12.39"  # 15.49 / 1.25 = 12.392


@pytest.mark.django_db
def test_type_cannot_be_sent(auth_client, body):
    data = auth_client.post(LIST, {**body, "type": "income", "is_subscription": False}, format="json").json()

    row = RecurringTransaction.objects.get(pk=data["id"])
    assert (row.type, row.is_subscription) == (TransactionType.EXPENSE, True)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("changes", "field", "message"),
    [
        ({"amount": "0"}, "amount", "Ensure this value is greater than or equal to 0.01."),
        ({"amount": "9.999"}, "amount", "Ensure that there are no more than 2 decimal places."),
        ({"amount": "4990.50", "currency": "HUF"}, "amount", "HUF amounts can't have decimals."),
        ({"currency": "XYZ"}, "currency", '"XYZ" is not a valid choice.'),
        ({"frequency": "daily"}, "frequency", '"daily" is not a valid choice.'),
        ({"end_date": "2025-12-31"}, "end_date", "End date must be on or after the start date."),
        ({"name": ""}, "name", "This field may not be blank."),
        ({"start_date": None}, "start_date", "This field may not be null."),
    ],
)
def test_invalid_input_is_rejected(auth_client, body, changes, field, message):
    response = auth_client.post(LIST, {**body, **changes}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()[field] == [message]
    assert not Subscription.objects.exists()


@pytest.mark.django_db
def test_an_income_category_is_rejected(auth_client, body, salary):
    response = auth_client.post(LIST, {**body, "category": salary.id}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"category": ["Subscriptions are expenses: choose an expense category."]}


@pytest.mark.django_db
def test_another_users_category_is_rejected(auth_client, body, other_user):
    theirs = Category.objects.create(user=other_user, name="Streaming", type=TransactionType.EXPENSE)

    response = auth_client.post(LIST, {**body, "category": theirs.id}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "category" in response.json()


@pytest.mark.django_db
def test_required_fields(auth_client):
    response = auth_client.post(LIST, {}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert set(response.json()) == {"name", "amount", "category", "frequency", "start_date"}


# --- Read -----------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_list_shows_only_own_subscriptions_active_paused_ended(
    auth_client, make_subscription, user, other_user, entertainment
):
    make_subscription("Spotify")
    make_subscription("Adobe", is_active=False)
    make_subscription("Netflix")
    make_subscription("Deezer", start_date=date(2025, 1, 1), end_date=date(2025, 6, 1))  # ended
    RecurringTransaction.objects.create(  # a plain recurring expense is not a subscription
        user=user,
        category=entertainment,
        name="Rent",
        type=TransactionType.EXPENSE,
        amount=D("600.00"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )
    Subscription.objects.create(
        user=other_user,
        category=entertainment,
        name="Theirs",
        amount=D("1.00"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )

    response = auth_client.get(LIST)

    assert [item["name"] for item in response.json()] == ["Netflix", "Spotify", "Adobe", "Deezer"]
    assert [item["status"] for item in response.json()] == ["active", "active", "paused", "ended"]


@pytest.mark.django_db
def test_list_query_count_is_constant(auth_client, make_subscription, django_assert_max_num_queries):
    for index in range(10):
        make_subscription(f"Service {index}")

    # auth (user) + subscriptions with their categories — never one query per subscription
    with django_assert_max_num_queries(2):
        assert len(auth_client.get(LIST).json()) == 10


@pytest.mark.django_db
def test_detail(auth_client, make_subscription):
    netflix = make_subscription("Netflix", "17.99", description="Premium")

    data = auth_client.get(_detail(netflix)).json()

    assert (data["name"], data["description"], data["monthly_cost"]) == ("Netflix", "Premium", "17.99")


@pytest.mark.django_db
def test_other_users_subscription_is_not_found(auth_client, other_user, entertainment):
    theirs = Subscription.objects.create(
        user=other_user,
        category=entertainment,
        name="Theirs",
        amount=D("1.00"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )

    assert auth_client.get(_detail(theirs)).status_code == status.HTTP_404_NOT_FOUND
    assert auth_client.patch(_detail(theirs), {"amount": "0.01"}, format="json").status_code == 404
    assert auth_client.delete(_detail(theirs)).status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_a_plain_recurring_transaction_is_not_reachable_as_a_subscription(auth_client, user, entertainment):
    rent = RecurringTransaction.objects.create(
        user=user,
        category=entertainment,
        name="Rent",
        type=TransactionType.EXPENSE,
        amount=D("600.00"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )

    assert auth_client.get(reverse("subscription-detail", args=[rent.pk])).status_code == 404


# --- Update / delete ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_pausing_stops_the_payments(auth_client, make_subscription):
    netflix = make_subscription()

    data = auth_client.patch(_detail(netflix), {"active": False}, format="json").json()

    assert (data["active"], data["status"], data["next_payment_date"], data["upcoming_payments"]) == (
        False,
        "paused",
        None,
        [],
    )
    netflix.refresh_from_db()
    assert netflix.is_active is False


@pytest.mark.django_db
def test_price_change_and_new_start_date(auth_client, make_subscription):
    netflix = make_subscription(start_date=date(2026, 1, 5))

    data = auth_client.patch(_detail(netflix), {"amount": "19.99", "start_date": "2026-02-10"}, format="json").json()

    assert (data["amount"], data["yearly_cost"]) == ("19.99", "239.88")
    netflix.refresh_from_db()
    assert netflix.next_occurrence_date == date(2026, 2, 10)  # scheduling state follows start_date


@pytest.mark.django_db
def test_patch_validates_the_resulting_subscription(auth_client, make_subscription, salary):
    netflix = make_subscription(start_date=date(2026, 1, 5))

    assert auth_client.patch(_detail(netflix), {"end_date": "2025-01-01"}, format="json").status_code == 400
    assert auth_client.patch(_detail(netflix), {"category": salary.id}, format="json").status_code == 400
    assert auth_client.patch(_detail(netflix), {"currency": "JPY"}, format="json").json() == {
        "amount": ["JPY amounts can't have decimals."]  # 9.99 yen doesn't exist
    }


@pytest.mark.django_db
def test_put_is_not_supported(auth_client, make_subscription, body):
    assert auth_client.put(_detail(make_subscription()), body, format="json").status_code == 405


@pytest.mark.django_db
def test_delete_keeps_the_recorded_payments(auth_client, user, make_subscription, entertainment):
    netflix = make_subscription()
    payment = Transaction.objects.create(
        user=user,
        category=entertainment,
        type=TransactionType.EXPENSE,
        amount=D("9.99"),
        date=date(2026, 9, 5),
        recurring_transaction=netflix,
    )

    assert auth_client.delete(_detail(netflix)).status_code == status.HTTP_204_NO_CONTENT

    assert not RecurringTransaction.objects.filter(pk=netflix.pk).exists()
    payment.refresh_from_db()
    assert payment.recurring_transaction is None


# --- Summary --------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_summary_endpoint(auth_client, make_subscription, bills):
    make_subscription("Netflix", "17.99")
    make_subscription("Spotify", "10.99")
    make_subscription("Disney+", "9.99")
    make_subscription("Adobe", "299.88", frequency=Frequency.YEARLY, start_date=date(2026, 3, 14))
    make_subscription("Gym", "32.00", category=bills)

    data = auth_client.get(SUMMARY).json()

    assert (data["monthly_total"], data["yearly_total"]) == ("95.96", "1151.52")
    assert (data["active_count"], data["paused_count"], data["ended_count"]) == (5, 0, 0)
    assert data["by_category"][0] == {
        "category_id": data["by_category"][0]["category_id"],
        "category_name": "Entertainment",
        "monthly_total": "63.96",
        "subscription_count": 4,
        "percentage": 66.65,
    }
    assert all(
        set(payment) == {"subscription_id", "name", "date", "amount", "currency", "base_amount"}
        for payment in data["upcoming"]
    )
    assert data["unconverted_currencies"] == []


@pytest.mark.django_db
def test_empty_summary(auth_client):
    data = auth_client.get(SUMMARY).json()

    assert (data["monthly_total"], data["yearly_total"], data["active_count"]) == ("0.00", "0.00", 0)
    assert (data["by_category"], data["upcoming"]) == ([], [])


# --- The rest of the API: recurring transactions, base currency, categories, dashboard -------------


@pytest.mark.django_db
def test_subscriptions_are_listed_as_recurring_transactions(auth_client, make_subscription):
    make_subscription("Netflix", merchant="Netflix International B.V.")

    [item] = auth_client.get(reverse("recurringtransaction-list")).json()

    assert (item["name"], item["is_subscription"], item["type"], item["merchant"]) == (
        "Netflix",
        True,
        "expense",
        "Netflix International B.V.",
    )


@pytest.mark.django_db
def test_the_recurring_endpoint_cannot_turn_a_subscription_into_income(auth_client, make_subscription, salary):
    netflix = make_subscription()
    url = reverse("recurringtransaction-detail", args=[netflix.pk])

    response = auth_client.patch(url, {"type": "income", "category": salary.id}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"type": ["Subscriptions are always expenses."]}


@pytest.mark.django_db
def test_recurring_transactions_are_not_subscriptions_by_default(auth_client, entertainment):
    created = auth_client.post(
        reverse("recurringtransaction-list"),
        {
            "name": "Rent",
            "category": entertainment.id,
            "type": "expense",
            "amount": "600.00",
            "frequency": "monthly",
            "start_date": "2026-01-01",
            "is_subscription": True,
        },
        format="json",
    ).json()

    assert (created["is_subscription"], created["currency"]) == (False, "EUR")
    assert auth_client.get(LIST).json() == []


@pytest.mark.django_db
def test_changing_the_base_currency_keeps_what_the_bill_says(auth_client, user, make_subscription, add_rates):
    add_rates(timezone.localdate(), HUF="400")
    netflix = make_subscription("Netflix", "17.99")

    assert auth_client.patch(reverse("auth-me"), {"base_currency": "HUF"}, format="json").status_code == 200

    netflix.refresh_from_db()
    assert (netflix.amount, netflix.currency) == (D("17.99"), "EUR")
    summary = auth_client.get(SUMMARY).json()
    assert (summary["currency"], summary["monthly_total"]) == ("HUF", "7196.00")  # 17.99 × 400


@pytest.mark.django_db
def test_a_category_with_subscriptions_cannot_be_deleted(auth_client, user, make_subscription):
    streaming = Category.objects.create(user=user, name="Streaming", type=TransactionType.EXPENSE)
    make_subscription(category=streaming)

    response = auth_client.delete(reverse("category-detail", args=[streaming.pk]))

    assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.django_db
def test_the_dashboard_shows_the_months_subscriptions(auth_client, make_subscription):
    make_subscription("Netflix", "17.99", start_date=date(2026, 1, 5))
    make_subscription("Adobe", "299.88", frequency=Frequency.YEARLY, start_date=date(2025, 3, 14))

    march = auth_client.get(reverse("analytics-dashboard"), {"year": 2026, "month": 3}).json()

    assert march["subscriptions"] == {
        "active_count": 2,
        "monthly_total": "42.98",
        "yearly_total": "515.76",
        "due_this_month": "317.87",
        "unconverted_currencies": [],
    }
