from datetime import date, timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

FRIDAY = date(2026, 9, 25)
SUNDAY = date(2026, 9, 27)


def _convert(client, **params):
    return client.get(reverse("currency-convert"), params)


@pytest.mark.django_db
def test_convert_requires_authentication(api_client):
    assert _convert(api_client, amount="1", currency="HUF").status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_converts_into_the_users_base_currency(auth_client, add_rates):
    add_rates(FRIDAY, HUF="389.85")

    response = _convert(auth_client, amount="15000", currency="HUF", date=SUNDAY.isoformat())

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "amount": "15000.00",
        "currency": "HUF",
        "base_currency": "EUR",
        "exchange_rate": "0.0025650891",
        "base_amount": "38.48",
        "rate_date": "2026-09-25",
    }


@pytest.mark.django_db
def test_the_base_currency_itself_needs_no_rate(auth_client):
    response = _convert(auth_client, amount="12.50", currency="EUR")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["exchange_rate"] == "1.0000000000"
    assert response.json()["base_amount"] == "12.50"
    assert response.json()["rate_date"] is None


@pytest.mark.django_db
def test_uses_the_base_currency_of_the_signed_in_user(auth_client, user, add_rates):
    user.base_currency = "HUF"
    user.save(update_fields=["base_currency"])
    add_rates(FRIDAY, HUF="400")

    response = _convert(auth_client, amount="10.00", currency="EUR", date=FRIDAY.isoformat())

    assert response.json()["base_currency"] == "HUF"
    assert response.json()["base_amount"] == "4000.00"


@pytest.mark.django_db
def test_date_defaults_to_today(auth_client, add_rates):
    add_rates(timezone.localdate() - timedelta(days=1), USD="1.25")

    response = _convert(auth_client, amount="10", currency="USD")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["base_amount"] == "8.00"


@pytest.mark.django_db
def test_missing_rate_is_a_validation_error(auth_client):
    response = _convert(auth_client, amount="10", currency="USD", date=FRIDAY.isoformat())

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"exchange_rate": ["No USD exchange rate is available for 2026-09-25."]}


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"amount": "1500.50", "currency": "HUF"}, "amount"),
        ({"amount": "100.10", "currency": "JPY"}, "amount"),
        ({"amount": "0", "currency": "USD"}, "amount"),
        ({"amount": "abc", "currency": "USD"}, "amount"),
        ({"currency": "USD"}, "amount"),
        ({"amount": "10", "currency": "XYZ"}, "currency"),
        ({"amount": "10", "currency": "usd"}, "currency"),
        ({"amount": "10", "currency": "USD", "date": "25/09/2026"}, "date"),
    ],
)
def test_invalid_input(auth_client, params, field):
    response = _convert(auth_client, **params)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert field in response.json()
