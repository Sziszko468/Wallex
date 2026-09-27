"""Changing the base currency: PATCH /api/auth/me/ → apps.currencies.services.change_base_currency."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.budgets.models import Budget
from apps.categories.models import Category, TransactionType
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

# Relative to today, so that "the latest rate" (yesterday) never falls on a transaction's date.
TODAY = timezone.localdate()
EARLIER = TODAY - timedelta(days=60)
RECENT = TODAY - timedelta(days=30)
LATEST = TODAY - timedelta(days=1)
RECENT_MONTH = {"year": RECENT.year, "month": RECENT.month}


@pytest.fixture
def food(user):
    return Category.objects.create(user=user, name="Food", type=TransactionType.EXPENSE)


@pytest.fixture
def rates(add_rates):
    add_rates(EARLIER, HUF="390", USD="1.20")
    add_rates(RECENT, HUF="400", USD="1.25")
    add_rates(LATEST, HUF="410", USD="1.30")


def _tx(user, category, amount, currency="EUR", rate="1", day=RECENT):
    return Transaction.objects.create(
        user=user, category=category, type=category.type, amount=Decimal(amount),
        currency=currency, exchange_rate=Decimal(rate), date=day,
    )


def _change(client, currency):
    return client.patch(reverse("auth-me"), {"base_currency": currency}, format="json")


@pytest.mark.django_db
def test_transactions_are_re_expressed_with_the_rate_of_their_own_date(auth_client, user, food, rates):
    earlier = _tx(user, food, "10.00", day=EARLIER)
    recent = _tx(user, food, "10.00", day=RECENT)

    response = _change(auth_client, "HUF")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["base_currency"] == "HUF"
    earlier.refresh_from_db()
    recent.refresh_from_db()
    assert (earlier.exchange_rate, earlier.base_amount) == (Decimal("390"), Decimal("3900.00"))
    assert (recent.exchange_rate, recent.base_amount) == (Decimal("400"), Decimal("4000.00"))
    # The original amount and currency never change.
    assert (recent.amount, recent.currency) == (Decimal("10.00"), "EUR")


@pytest.mark.django_db
def test_a_transaction_in_the_new_base_currency_gets_rate_one(auth_client, user, food, rates):
    forints = _tx(user, food, "15000", currency="HUF", rate="0.0025")

    _change(auth_client, "HUF")

    forints.refresh_from_db()
    assert (forints.exchange_rate, forints.base_amount) == (Decimal(1), Decimal("15000.00"))


@pytest.mark.django_db
def test_a_manual_rate_is_carried_over(auth_client, user, food, rates):
    # 10 USD at a hand-entered 0.9 EUR/USD, then EUR → HUF at 400 on that day: 0.9 × 400 = 360 HUF/USD.
    dollars = _tx(user, food, "10.00", currency="USD", rate="0.9")

    _change(auth_client, "HUF")

    dollars.refresh_from_db()
    assert dollars.exchange_rate == Decimal("360")
    assert dollars.base_amount == Decimal("3600.00")


@pytest.mark.django_db
def test_budgets_are_converted_at_the_latest_rate(auth_client, user, food, rates):
    budget = Budget.objects.create(user=user, category=food, amount=Decimal("100.55"), year=2026, month=9)

    _change(auth_client, "HUF")

    budget.refresh_from_db()
    assert budget.amount == Decimal("41226")  # 100.55 × 410 = 41225.5 → whole forints, half up


@pytest.mark.django_db
def test_recurring_amounts_keep_their_own_currency(auth_client, user, food, rates):
    rent = RecurringTransaction.objects.create(
        user=user, category=food, name="Rent", type=TransactionType.EXPENSE, amount=Decimal("500.00"),
        frequency=Frequency.MONTHLY, start_date=RECENT, next_occurrence_date=RECENT,
    )

    _change(auth_client, "HUF")

    rent.refresh_from_db()
    # The rent is still 500 euros; totals convert it (see apps.analytics / apps.subscriptions).
    assert (rent.amount, rent.currency) == (Decimal("500.00"), "EUR")


@pytest.mark.django_db
def test_totals_follow_the_new_base_currency(auth_client, user, food, rates):
    _tx(user, food, "10.00")
    _tx(user, food, "15000", currency="HUF", rate="0.0025")

    before = auth_client.get(reverse("analytics-dashboard"), RECENT_MONTH).json()
    _change(auth_client, "HUF")
    after = auth_client.get(reverse("analytics-dashboard"), RECENT_MONTH).json()

    assert before["total_expenses"] == "47.50"  # 10 EUR + 37.50 EUR
    assert after["total_expenses"] == "19000.00"  # 4000 HUF + 15000 HUF


@pytest.mark.django_db
def test_switching_back_restores_the_original_rates(auth_client, user, food, rates):
    euros = _tx(user, food, "10.00")

    _change(auth_client, "HUF")
    _change(auth_client, "EUR")

    euros.refresh_from_db()
    assert (euros.exchange_rate, euros.base_amount) == (Decimal(1), Decimal("10.00"))


@pytest.mark.django_db
def test_missing_rates_change_nothing(auth_client, user, food, rates):
    old = _tx(user, food, "10.00", day=date(2019, 3, 4))  # no rates loaded for 2019
    budget = Budget.objects.create(user=user, category=food, amount=Decimal("100.00"), year=2026, month=9)

    response = _change(auth_client, "HUF")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"base_currency": ["No HUF exchange rate is available for 2019-03-04."]}
    user.refresh_from_db()
    old.refresh_from_db()
    budget.refresh_from_db()
    assert user.base_currency == "EUR"
    assert old.exchange_rate == Decimal(1)
    assert budget.amount == Decimal("100.00")


@pytest.mark.django_db
def test_without_data_no_rate_is_needed(auth_client, user):
    response = _change(auth_client, "JPY")

    assert response.status_code == status.HTTP_200_OK
    user.refresh_from_db()
    assert user.base_currency == "JPY"


@pytest.mark.django_db
def test_setting_the_same_currency_changes_nothing(auth_client, user, food):
    euros = _tx(user, food, "10.00")

    response = _change(auth_client, "EUR")

    assert response.status_code == status.HTTP_200_OK
    euros.refresh_from_db()
    assert euros.exchange_rate == Decimal(1)


@pytest.mark.django_db
def test_query_count_does_not_grow_with_the_data(auth_client, user, food, rates, django_assert_max_num_queries):
    for _ in range(30):
        _tx(user, food, "1.00")
    for month in range(1, 13):
        Budget.objects.create(user=user, category=food, amount=Decimal("100.00"), year=2026, month=month)

    with django_assert_max_num_queries(15):
        assert _change(auth_client, "HUF").status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_only_the_base_currency_is_writable(auth_client, user):
    response = auth_client.patch(
        reverse("auth-me"), {"email": "someone.else@example.com", "first_name": "Eve"}, format="json"
    )

    assert response.status_code == status.HTTP_200_OK
    user.refresh_from_db()
    assert user.email == "testuser@example.com"
    assert user.first_name == ""


@pytest.mark.django_db
@pytest.mark.parametrize("currency", ["XYZ", "huf", "", None])
def test_unsupported_currency_is_rejected(auth_client, user, currency):
    response = _change(auth_client, currency)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "base_currency" in response.json()
    user.refresh_from_db()
    assert user.base_currency == "EUR"


@pytest.mark.django_db
def test_other_users_are_not_touched(auth_client, other_user, rates):
    theirs_category = Category.objects.create(user=other_user, name="Food", type=TransactionType.EXPENSE)
    theirs = _tx(other_user, theirs_category, "10.00")

    _change(auth_client, "HUF")

    theirs.refresh_from_db()
    other_user.refresh_from_db()
    assert theirs.exchange_rate == Decimal(1)
    assert other_user.base_currency == "EUR"


@pytest.mark.django_db
def test_put_is_not_offered(auth_client):
    assert auth_client.put(reverse("auth-me"), {"base_currency": "HUF"}, format="json").status_code == 405
