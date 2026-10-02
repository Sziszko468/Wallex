"""Amounts written into texts the server produces, such as notifications.

The clients format money themselves (in the viewer's locale). A notification is shown by
the phone's operating system exactly as sent, so its text needs the amount already
formatted — in the language of the notification: "€1,234.50" in English, "1 234,50 €" in
Hungarian.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.utils import translation
from django.utils.numberformat import format as format_number

from .models import Currency
from .rates import minor_unit

# currency -> symbol (or code) as written in English; Hungarian puts every one after the amount.
_SYMBOLS: dict[str, str] = {
    Currency.EUR: "€",
    Currency.USD: "$",
    Currency.GBP: "£",
    Currency.JPY: "¥",
    Currency.CHF: "CHF",
    Currency.HUF: "Ft",
}
# English writes the symbol before the amount; the exceptions follow it ("15,000 Ft").
_ENGLISH_SUFFIXED = {Currency.HUF}
_NBSP = "\u00a0"
DIGIT_GROUP_SIZE = 3  # 1,234,567 / 1 234 567


def format_money(amount: Decimal, currency: str) -> str:
    """€1,234.50, $12.99, 15,000 Ft, CHF 8.20 — and in Hungarian 1 234,50 €, 15 000 Ft.
    Whole amounts drop the decimals: €150."""
    value = amount.quantize(minor_unit(currency), rounding=ROUND_HALF_UP)
    decimals = 0 if value == value.to_integral_value() else -minor_unit(currency).as_tuple().exponent
    is_hungarian = (translation.get_language() or "").startswith("hu")
    number = format_number(
        abs(value),
        "," if is_hungarian else ".",
        decimal_pos=decimals,
        grouping=DIGIT_GROUP_SIZE,
        thousand_sep=_NBSP if is_hungarian else ",",
        force_grouping=True,
    )
    sign = "-" if value < 0 else ""
    symbol = _SYMBOLS[currency]
    if is_hungarian or currency in _ENGLISH_SUFFIXED:
        return f"{sign}{number}{_NBSP if is_hungarian else ' '}{symbol}"
    return f"{sign}{symbol}{' ' if currency == Currency.CHF else ''}{number}"
