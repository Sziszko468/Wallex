"""Transactions in several currencies: amount + currency as paid, exchange_rate and base_amount."""

from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status

from apps.budgets.models import Budget
from apps.categories.defaults import create_default_categories
from apps.currencies.models import ExchangeRate
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

FRIDAY = date(2026, 9, 25)
SUNDAY = date(2026, 9, 27)
MONDAY = date(2026, 9, 28)


@pytest.fixture
def rates(add_rates):
    add_rates(FRIDAY, HUF="400", USD="1.25", JPY="160")


def _create(client, category, **fields):
    body = {"type": "expense", "category": category.id, "amount": "10.00", "date": FRIDAY.isoformat(), **fields}
    return client.post(reverse("transaction-list"), body, format="json")


def _use_base_currency(user, currency):
    user.base_currency = currency
    user.save(update_fields=["base_currency"])


# --- Create ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_without_a_currency_it_works_exactly_as_before(auth_client, expense_category):
    response = _create(auth_client, expense_category, amount="12.50")

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert (data["amount"], data["currency"], data["exchange_rate"], data["base_amount"]) == (
        "12.50", "EUR", "1.0000000000", "12.50"
    )


@pytest.mark.django_db
def test_default_currency_is_the_users_base_currency(auth_client, user, expense_category):
    _use_base_currency(user, "HUF")

    response = _create(auth_client, expense_category, amount="4590")

    assert response.json()["currency"] == "HUF"
    assert response.json()["base_amount"] == "4590.00"


@pytest.mark.django_db
def test_foreign_currency_keeps_the_amount_and_stores_the_converted_value(auth_client, expense_category, rates):
    response = _create(auth_client, expense_category, amount="15000", currency="HUF", date=SUNDAY.isoformat())

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["amount"] == "15000.00"
    assert data["currency"] == "HUF"
    assert data["exchange_rate"] == "0.0025000000"  # Friday's ECB rate for a Sunday
    assert data["base_amount"] == "37.50"
    stored = Transaction.objects.get(pk=data["id"])
    assert (stored.amount, stored.currency, stored.base_amount) == (Decimal("15000"), "HUF", Decimal("37.50"))


@pytest.mark.django_db
def test_a_manual_rate_is_used_as_sent(auth_client, expense_category):
    response = _create(auth_client, expense_category, amount="10.00", currency="USD", exchange_rate="0.9")

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["exchange_rate"] == "0.9000000000"
    assert response.json()["base_amount"] == "9.00"


@pytest.mark.django_db
def test_rate_other_than_one_for_the_base_currency_is_rejected(auth_client, expense_category):
    response = _create(auth_client, expense_category, currency="EUR", exchange_rate="1.1")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"exchange_rate": ["Must be 1 when the currency is your base currency."]}


@pytest.mark.django_db
def test_missing_rate_is_a_clear_validation_error(auth_client, expense_category):
    response = _create(auth_client, expense_category, currency="GBP")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "exchange_rate": ["No GBP exchange rate is available for 2026-09-25. Enter the rate manually or try again later."]
    }
    assert not Transaction.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("fields", "error_field"),
    [
        ({"currency": "XYZ"}, "currency"),
        ({"currency": "huf"}, "currency"),
        ({"currency": None}, "currency"),
        ({"currency": "HUF", "amount": "15000.50"}, "amount"),
        ({"currency": "JPY", "amount": "100.10"}, "amount"),
        ({"currency": "USD", "exchange_rate": "0"}, "exchange_rate"),
        ({"currency": "USD", "exchange_rate": "-1"}, "exchange_rate"),
        ({"currency": "USD", "exchange_rate": "0.00000000001"}, "exchange_rate"),
    ],
)
def test_invalid_currency_input(auth_client, expense_category, rates, fields, error_field):
    response = _create(auth_client, expense_category, **fields)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert error_field in response.json()
    assert not Transaction.objects.exists()


@pytest.mark.django_db
def test_a_value_too_large_for_the_base_currency_is_rejected(auth_client, expense_category):
    response = _create(auth_client, expense_category, amount="9999999999.99", currency="USD", exchange_rate="1001")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"amount": ["This amount is too large to convert to your base currency."]}


# --- Update ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_editing_the_amount_keeps_the_stored_rate(auth_client, expense_category, rates, add_rates):
    created = _create(auth_client, expense_category, amount="15000", currency="HUF").json()
    add_rates(FRIDAY, HUF="500")  # the ECB table changes later (e.g. a correction)

    response = auth_client.patch(reverse("transaction-detail", args=[created["id"]]), {"amount": "20000"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["exchange_rate"] == "0.0025000000"
    assert response.json()["base_amount"] == "50.00"  # recomputed and returned fresh


@pytest.mark.django_db
def test_changing_the_date_looks_the_rate_up_again(auth_client, expense_category, rates, add_rates):
    add_rates(MONDAY, HUF="500")
    created = _create(auth_client, expense_category, amount="15000", currency="HUF").json()

    response = auth_client.patch(
        reverse("transaction-detail", args=[created["id"]]), {"date": MONDAY.isoformat()}, format="json"
    )

    assert response.json()["exchange_rate"] == "0.0020000000"
    assert response.json()["base_amount"] == "30.00"


@pytest.mark.django_db
def test_changing_to_the_base_currency_resets_the_rate(auth_client, expense_category, rates):
    created = _create(auth_client, expense_category, amount="15000", currency="HUF").json()

    response = auth_client.patch(
        reverse("transaction-detail", args=[created["id"]]), {"currency": "EUR", "amount": "37.50"}, format="json"
    )

    assert (response.json()["exchange_rate"], response.json()["base_amount"]) == ("1.0000000000", "37.50")


@pytest.mark.django_db
def test_a_full_update_without_currency_keeps_it(auth_client, expense_category, rates):
    created = _create(auth_client, expense_category, amount="15000", currency="HUF").json()
    body = {"type": "expense", "category": expense_category.id, "amount": "16000", "date": FRIDAY.isoformat()}

    response = auth_client.put(reverse("transaction-detail", args=[created["id"]]), body, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert (response.json()["currency"], response.json()["base_amount"]) == ("HUF", "40.00")


@pytest.mark.django_db
def test_a_new_currency_without_a_rate_is_rejected_on_update(auth_client, expense_category):
    created = _create(auth_client, expense_category).json()

    response = auth_client.patch(reverse("transaction-detail", args=[created["id"]]), {"currency": "CHF"}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "exchange_rate" in response.json()
    assert Transaction.objects.get(pk=created["id"]).currency == "EUR"


# --- Lists, totals, imports -------------------------------------------------------------


@pytest.mark.django_db
def test_ordering_by_base_amount_compares_values_across_currencies(auth_client, expense_category, rates):
    _create(auth_client, expense_category, amount="15000", currency="HUF", description="37.50 EUR")
    _create(auth_client, expense_category, amount="50.00", description="50 EUR")
    _create(auth_client, expense_category, amount="1600", currency="JPY", description="10 EUR")

    by_value = auth_client.get(reverse("transaction-list"), {"ordering": "-base_amount"}).json()["results"]
    by_number = auth_client.get(reverse("transaction-list"), {"ordering": "-amount"}).json()["results"]

    assert [row["description"] for row in by_value] == ["50 EUR", "37.50 EUR", "10 EUR"]
    assert [row["description"] for row in by_number] == ["37.50 EUR", "10 EUR", "50 EUR"]


@pytest.mark.django_db
def test_budget_spending_counts_the_converted_value(auth_client, user, expense_category, rates):
    Budget.objects.create(user=user, category=expense_category, amount=Decimal("100.00"), year=2026, month=9)
    _create(auth_client, expense_category, amount="15000", currency="HUF")
    _create(auth_client, expense_category, amount="12.50")

    [budget] = auth_client.get(reverse("budget-list")).json()

    assert budget["spent_amount"] == "50.00"
    assert budget["remaining_amount"] == "50.00"


@pytest.mark.django_db
def test_budget_and_recurring_amounts_follow_the_base_currency_precision(auth_client, user, expense_category):
    _use_base_currency(user, "HUF")

    budget = auth_client.post(
        reverse("budget-list"), {"category": expense_category.id, "amount": "50000.50", "year": 2026, "month": 9}, format="json"
    )
    recurring = auth_client.post(
        reverse("recurringtransaction-list"),
        {
            "name": "Rent", "category": expense_category.id, "type": "expense", "amount": "150000.50",
            "frequency": Frequency.MONTHLY, "start_date": "2026-10-01",
        },
        format="json",
    )

    assert budget.status_code == recurring.status_code == status.HTTP_400_BAD_REQUEST
    assert budget.json() == recurring.json() == {"amount": ["HUF amounts can't have decimals."]}
    assert not Budget.objects.exists() and not RecurringTransaction.objects.exists()


def _csv(content: str) -> SimpleUploadedFile:
    return SimpleUploadedFile("bank.csv", content.encode(), content_type="text/csv")


@pytest.mark.django_db
def test_csv_rows_are_in_the_base_currency(auth_client, user):
    create_default_categories(user)
    _use_base_currency(user, "HUF")
    upload = _csv("date,description,amount\n2026-09-10,Tesco,-4590\n2026-09-11,Aldi,-1234.56\n")

    result = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart").json()

    assert (result["imported"], result["failed"]) == (1, 1)
    assert result["details"] == [{"row": 3, "status": "failed", "reason": "HUF amounts can't have decimals."}]
    imported = Transaction.objects.get()
    assert (imported.amount, imported.currency, imported.base_amount) == (Decimal("4590"), "HUF", Decimal("4590"))


@pytest.mark.django_db
def test_csv_duplicate_check_compares_the_currency_too(auth_client, user, expense_category, rates):
    create_default_categories(user)
    _create(auth_client, expense_category, amount="4590", currency="HUF", description="Tesco")
    upload = _csv("date,description,amount\n2026-09-25,Tesco,-4590\n")  # 4590 EUR: not the same payment

    result = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart").json()

    assert result["imported"] == 1
    assert Transaction.objects.filter(currency="EUR", amount=Decimal("4590")).exists()


@pytest.mark.django_db
def test_rates_are_global_data_not_per_user(auth_client, other_auth_client, expense_category, other_user_expense_category, rates):
    mine = _create(auth_client, expense_category, amount="15000", currency="HUF").json()
    theirs = _create(other_auth_client, other_user_expense_category, amount="15000", currency="HUF").json()

    assert mine["base_amount"] == theirs["base_amount"] == "37.50"
    assert ExchangeRate.objects.count() == 3
