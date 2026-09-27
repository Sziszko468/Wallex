from decimal import Decimal

import pytest

from .formatting import format_money


@pytest.mark.parametrize(
    ("amount", "currency", "expected"),
    [
        ("150.00", "EUR", "€150"),  # whole amounts drop the decimals
        ("1234.5", "EUR", "€1,234.50"),
        ("12.99", "USD", "$12.99"),
        ("0.2", "GBP", "£0.20"),
        ("8.2", "CHF", "CHF 8.20"),
        ("15000", "HUF", "15,000 Ft"),
        ("15000.50", "HUF", "15,001 Ft"),  # forints have no decimals: rounded half up
        ("1200", "JPY", "¥1,200"),
        ("1234567.891", "EUR", "€1,234,567.89"),
        ("-5.00", "EUR", "-€5"),
        ("0", "EUR", "€0"),
    ],
)
def test_format_money(amount, currency, expected):
    assert format_money(Decimal(amount), currency) == expected
