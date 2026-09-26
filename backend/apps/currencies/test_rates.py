from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.currencies.rates import (
    MAX_RATE_AGE,
    MissingExchangeRateError,
    base_amount_for,
    convert,
    exchange_rate,
    has_valid_precision,
    to_currency,
)

FRIDAY = date(2026, 9, 25)
SUNDAY = date(2026, 9, 27)
MONDAY = date(2026, 9, 28)


@pytest.mark.django_db
def test_same_currency_needs_no_rate_and_no_query(django_assert_num_queries):
    with django_assert_num_queries(0):
        rate = exchange_rate("HUF", "HUF", FRIDAY)

    assert rate.value == Decimal(1)
    assert rate.published_on is None


@pytest.mark.django_db
def test_rates_against_the_euro_are_the_ecb_quote_or_its_inverse(add_rates):
    add_rates(FRIDAY, HUF="400")

    assert exchange_rate("EUR", "HUF", FRIDAY).value == Decimal("400")
    assert exchange_rate("HUF", "EUR", FRIDAY).value == Decimal("0.0025")


@pytest.mark.django_db
def test_cross_rate_between_two_non_euro_currencies(add_rates):
    add_rates(FRIDAY, HUF="400", USD="1.25")

    assert exchange_rate("USD", "HUF", FRIDAY).value == Decimal("320")
    assert exchange_rate("HUF", "USD", FRIDAY).value == Decimal("0.003125")


@pytest.mark.django_db
def test_rate_is_rounded_to_ten_decimals(add_rates):
    add_rates(FRIDAY, HUF="389.85")

    # 1 / 389.85 = 0.002565089136...
    assert exchange_rate("HUF", "EUR", FRIDAY).value == Decimal("0.0025650891")


@pytest.mark.django_db
def test_a_weekend_uses_the_last_publication_before_it(add_rates):
    add_rates(FRIDAY, HUF="400")
    add_rates(MONDAY, HUF="500")  # later publications never apply backwards

    rate = exchange_rate("HUF", "EUR", SUNDAY)

    assert rate.value == Decimal("0.0025")
    assert rate.published_on == FRIDAY


@pytest.mark.django_db
def test_a_rate_older_than_the_limit_is_not_used(add_rates):
    add_rates(FRIDAY - MAX_RATE_AGE - timedelta(days=1), HUF="400")

    with pytest.raises(MissingExchangeRateError, match="No HUF exchange rate is available for 2026-09-25."):
        exchange_rate("HUF", "EUR", FRIDAY)


@pytest.mark.django_db
def test_a_rate_exactly_at_the_limit_is_used(add_rates):
    add_rates(FRIDAY - MAX_RATE_AGE, HUF="400")

    assert exchange_rate("HUF", "EUR", FRIDAY).value == Decimal("0.0025")


@pytest.mark.django_db
def test_no_rate_at_all():
    with pytest.raises(MissingExchangeRateError):
        exchange_rate("USD", "EUR", FRIDAY)


@pytest.mark.django_db
def test_both_sides_must_have_a_rate(add_rates):
    add_rates(FRIDAY, USD="1.25")

    with pytest.raises(MissingExchangeRateError, match="No HUF"):
        exchange_rate("USD", "HUF", FRIDAY)


@pytest.mark.django_db
def test_a_future_date_uses_the_latest_rate(add_rates):
    yesterday = timezone.localdate() - timedelta(days=1)
    add_rates(yesterday, USD="1.25")

    rate = exchange_rate("USD", "EUR", timezone.localdate() + timedelta(days=60))

    assert rate.value == Decimal("0.8")
    assert rate.published_on == yesterday


@pytest.mark.django_db
def test_a_lookup_is_one_query(add_rates, django_assert_num_queries):
    add_rates(FRIDAY, HUF="400", USD="1.25")

    with django_assert_num_queries(1):
        exchange_rate("USD", "HUF", FRIDAY)


@pytest.mark.django_db
def test_convert_gives_rate_base_amount_and_rate_date(add_rates):
    add_rates(FRIDAY, HUF="389.85")

    conversion = convert(Decimal("15000"), "HUF", "EUR", SUNDAY)

    assert conversion.exchange_rate == Decimal("0.0025650891")
    assert conversion.base_amount == Decimal("38.48")
    assert conversion.rate_date == FRIDAY


def test_base_amount_rounds_half_up_to_cents():
    assert base_amount_for(Decimal("1.00"), Decimal("0.125")) == Decimal("0.13")
    assert base_amount_for(Decimal("1"), Decimal("0.0025")) == Decimal("0.00")


@pytest.mark.parametrize(
    ("amount", "currency", "valid"),
    [
        ("1500", "HUF", True),
        ("1500.00", "HUF", True),
        ("1500.50", "HUF", False),
        ("100", "JPY", True),
        ("100.10", "JPY", False),
        ("10.99", "EUR", True),
        ("10.99", "CHF", True),
    ],
)
def test_whole_numbers_for_forint_and_yen(amount, currency, valid):
    assert has_valid_precision(Decimal(amount), currency) is valid


def test_to_currency_rounds_to_the_currency_unit_and_never_to_zero():
    assert to_currency(Decimal("100.00"), Decimal("389.85"), "HUF") == Decimal("38985")
    assert to_currency(Decimal("100.00"), Decimal("0.0025650891"), "EUR") == Decimal("0.26")
    assert to_currency(Decimal("1"), Decimal("0.0025"), "EUR") == Decimal("0.01")
