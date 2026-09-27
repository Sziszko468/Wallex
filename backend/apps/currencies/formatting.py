"""Amounts written into texts the server produces, such as notifications.

The clients format money themselves (in the viewer's locale). A notification is shown by
the phone's operating system exactly as sent, so its text needs the amount already
formatted. The texts are English, so the amounts follow English conventions.
"""

from decimal import ROUND_HALF_UP, Decimal

from .models import Currency
from .rates import minor_unit

# currency -> (prefix, suffix)
_AFFIXES: dict[str, tuple[str, str]] = {
    Currency.EUR: ("€", ""),
    Currency.USD: ("$", ""),
    Currency.GBP: ("£", ""),
    Currency.JPY: ("¥", ""),
    Currency.CHF: ("CHF ", ""),
    Currency.HUF: ("", " Ft"),
}


def format_money(amount: Decimal, currency: str) -> str:
    """€1,234.50, $12.99, 15,000 Ft, CHF 8.20. Whole amounts drop the decimals: €150."""
    value = amount.quantize(minor_unit(currency), rounding=ROUND_HALF_UP)
    decimals = 0 if value == value.to_integral_value() else -minor_unit(currency).as_tuple().exponent
    prefix, suffix = _AFFIXES[currency]
    sign = "-" if value < 0 else ""
    return f"{sign}{prefix}{abs(value):,.{decimals}f}{suffix}"
