from datetime import date
from decimal import Decimal

import pytest

from apps.receipts.parser import (
    Confidence,
    Extracted,
    Outcome,
    classify,
    extract_amount,
    extract_currency,
    extract_date,
    extract_items,
    extract_merchant,
    parse_receipt_text,
)

TODAY = date(2026, 9, 25)

HUNGARIAN_RECEIPT = """
SPAR Magyarország Kft.
1111 Budapest, Bartók Béla út 12.
Adószám: 10485824-2-07
KENYÉR 1 DB 549
TEJ 2,8% 1L 389
ÁFA 27% 437
ÖSSZESEN: 2 056 Ft
BANKKÁRTYA 2 056 Ft
2026.09.24. 14:05
Köszönjük a vásárlást!
"""


def test_full_hungarian_receipt():
    parsed = parse_receipt_text(HUNGARIAN_RECEIPT, TODAY)

    assert parsed.merchant.value == "SPAR Magyarország Kft"
    assert parsed.amount.value == Decimal("2056.00")
    assert parsed.date.value == date(2026, 9, 24)
    assert {parsed.merchant.confidence, parsed.amount.confidence, parsed.date.confidence} == {Confidence.HIGH}


# --- Amount ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("TOTAL 12.99", "12.99"),
        ("Total: 12,99 EUR", "12.99"),
        ("ÖSSZESEN 4 590 Ft", "4590.00"),
        ("Végösszeg: 1.234,50", "1234.50"),
        ("GRAND TOTAL $1,234.50", "1234.50"),
        ("Fizetendő 12 345", "12345.00"),
        ("TE BETALEN 7,45", "7.45"),
    ],
)
def test_amount_formats(line, expected):
    result = extract_amount(["Shop", line])
    assert result.value == Decimal(expected)
    assert result.confidence == Confidence.HIGH


def test_total_value_on_the_next_line():
    assert extract_amount(["TOTAL", "23.40"]).value == Decimal("23.40")


def test_strongest_keyword_wins():
    lines = ["Összesen 1 000", "Kedvezmény 200", "Fizetendő 800"]
    assert extract_amount(lines).value == Decimal("800.00")


@pytest.mark.parametrize(
    "noise",
    ["SUBTOTAL 50.00", "ÁFA összesen 437", "VAT 21% 8.00", "Visszajáró 3 000", "Készpénz 10 000", "CASH 100.00"],
)
def test_lines_that_are_never_the_total(noise):
    assert extract_amount(["Shop", noise, "TOTAL 42.00"]).value == Decimal("42.00")


def test_dates_and_times_are_not_amounts():
    assert extract_amount(["2026.09.24. 14:05", "Total 5.00"]).value == Decimal("5.00")
    assert extract_amount(["2026.09.24. 14:05"]).value is None


def test_without_total_line_largest_amount_is_a_low_confidence_guess():
    result = extract_amount(["Coffee 3.50", "Cake 4.20"])
    assert result.value == Decimal("4.20")
    assert result.confidence == Confidence.LOW


def test_no_amount_at_all():
    result = extract_amount(["Thank you", "See you soon"])
    assert result.value is None
    assert result.confidence == Confidence.LOW


def test_zero_amount_ignored():
    assert extract_amount(["TOTAL 0.00"]).value is None


# --- Date --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected", "confidence"),
    [
        ("2026.09.24.", date(2026, 9, 24), Confidence.HIGH),
        ("2026. 09. 24.", date(2026, 9, 24), Confidence.HIGH),
        ("2026-09-24 14:05", date(2026, 9, 24), Confidence.HIGH),
        ("24.09.2026", date(2026, 9, 24), Confidence.HIGH),
        ("24/09/2026", date(2026, 9, 24), Confidence.HIGH),
        ("09/24/2026", date(2026, 9, 24), Confidence.HIGH),  # US order, unambiguous
        ("05/06/2026", date(2026, 6, 5), Confidence.LOW),  # ambiguous: read day-first
        ("24.09.26", date(2026, 9, 24), Confidence.LOW),  # 2-digit year
    ],
)
def test_date_formats(text, expected, confidence):
    result = extract_date([f"Datum: {text}"], TODAY)
    assert result.value == expected
    assert result.confidence == confidence


def test_impossible_or_future_dates_are_skipped():
    lines = ["2026.13.40.", "Valid until 2027.01.31", "2026.09.20"]
    assert extract_date(lines, TODAY).value == date(2026, 9, 20)


def test_no_date():
    result = extract_date(["Shop", "TOTAL 5.00"], TODAY)
    assert result.value is None


# --- Merchant ----------------------------------------------------------------


def test_known_merchant_line_preferred():
    lines = ["*** WELCOME ***", "Store 214", "TESCO Global Áruházak Zrt."]
    result = extract_merchant(lines)
    assert result.value == "TESCO Global Áruházak Zrt"
    assert result.confidence == Confidence.HIGH


def test_company_suffix_line():
    result = extract_merchant(["Nyugta", "Kovács Pékség és Társa Bt.", "Fő utca 1."])
    assert result.value == "Kovács Pékség és Társa Bt"
    assert result.confidence == Confidence.HIGH


def test_first_name_like_line_is_a_low_confidence_guess():
    result = extract_merchant(["NYUGTA", "12345678", "Corner Coffee", "Latte 3.50"])
    assert result.value == "Corner Coffee"
    assert result.confidence == Confidence.LOW


def test_no_merchant():
    assert extract_merchant(["12345", "---", "3.50"]).value is None


@pytest.mark.parametrize("line", ["ÖSSZESEN 2 056 Ft", "TOTAL EUR 12.99", "BANKKÁRTYA 2 056", "ÁFA 27% 437"])
def test_a_money_line_is_never_the_merchant(line):
    assert extract_merchant([line, "2026.09.24."]).value is None


def test_empty_text():
    parsed = parse_receipt_text("   \n\n", TODAY)
    assert parsed.merchant.value is None
    assert parsed.amount.value is None
    assert parsed.date.value is None
    assert parsed.currency.value is None
    assert parsed.items == []


# --- Currency ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("ÖSSZESEN: 2 056 Ft", "HUF"),
        ("Fizetendő 2056Ft", "HUF"),
        ("Total 12,99 EUR", "EUR"),
        ("TOTAL 12.99 €", "EUR"),
        ("GRAND TOTAL $1,234.50", "USD"),
        ("Total £8.40", "GBP"),
        ("TOTAL CHF 23.50", "CHF"),
        ("合計 ¥1,280", "JPY"),
        ("Summe 3,20 EURO", "EUR"),
    ],
)
def test_currency_is_read_from_the_receipt(text, expected):
    currency, unsupported = extract_currency([text])

    assert (currency.value, currency.confidence, unsupported) == (expected, Confidence.HIGH, None)


@pytest.mark.parametrize("text", ["Soft drink 350", "Gift card", "Europe Kft", "Budapest"])
def test_currency_letters_inside_words_dont_count(text):
    assert extract_currency([text]) == (Extracted.missing(), None)


def test_several_currencies_make_a_low_confidence_guess():
    currency, _ = extract_currency(["Room 120.00 EUR", "Paid 47 000 Ft", "ÖSSZESEN 47 000 Ft"])

    assert (currency.value, currency.confidence) == ("HUF", Confidence.LOW)


@pytest.mark.parametrize(
    ("text", "code"),
    [("CELKEM 125,90 Kč", "CZK"), ("RAZEM 45,00 zł", "PLN"), ("TOTAL 120 lei", "RON"), ("TOTAL 1200 RSD", "RSD")],
)
def test_an_unsupported_currency_is_reported_not_guessed(text, code):
    currency, unsupported = extract_currency([text])

    assert currency.value is None
    assert unsupported == code


def test_no_currency_on_the_receipt():
    assert extract_currency(["Corner Coffee", "TOTAL 3.50"]) == (Extracted.missing(), None)


# --- Items -------------------------------------------------------------------


def test_items_of_a_hungarian_receipt():
    items = parse_receipt_text(HUNGARIAN_RECEIPT, TODAY).items

    # Not the address ("… út 12."), the VAT line, the total, the card payment or anything below them.
    assert [(item.name, item.amount) for item in items] == [
        ("KENYÉR 1 DB", Decimal("549.00")),
        ("TEJ 2,8% 1L", Decimal("389.00")),
    ]


def test_item_prices_with_currency_or_vat_letters():
    items = extract_items(["Corner Cafe", "Flat white 3.50 €", "Croissant 2,90 EUR", "Bagel 1.20 B", "TOTAL 7.60"])

    assert [(item.name, item.amount) for item in items] == [
        ("Flat white", Decimal("3.50")),
        ("Croissant", Decimal("2.90")),
        ("Bagel", Decimal("1.20")),
    ]


def test_quantity_lines_and_nameless_amounts_are_not_items():
    items = extract_items(["BANÁN 398", "2 DB X 199", "3 x 1.99", "12345", "ÖSSZESEN 1 000"])

    assert [item.name for item in items] == ["BANÁN"]


def test_an_item_never_exceeds_the_total():
    items = extract_items(["Laptop 999 999", "Sticker 2", "TOTAL 12"])

    assert [item.name for item in items] == ["Sticker"]


def test_the_price_must_end_the_line():
    assert extract_items(["Room 12 upstairs", "TOTAL 30.00"]) == []


def test_items_are_capped():
    lines = [f"Item {index} 1.00" for index in range(80)] + ["TOTAL 80.00"]

    assert len(extract_items(lines)) == 50


# --- Outcome -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "text_found", "outcome"),
    [
        (HUNGARIAN_RECEIPT, True, Outcome.COMPLETE),
        ("SPAR Kft.\nÖSSZESEN 2 056\n2026.09.24.", True, Outcome.INCOMPLETE),  # no currency printed
        ("Corner Coffee\nTOTAL 3.50 EUR", True, Outcome.INCOMPLETE),  # no date
        ("2026.09.24.\n12:05", True, Outcome.INCOMPLETE),  # a date, no total: maybe a faded receipt
        ("Soup of the day\nChef's special\nWelcome!", True, Outcome.UNSUPPORTED),  # a menu, not a receipt
        ("", False, Outcome.UNREADABLE),
    ],
)
def test_outcome(text, text_found, outcome):
    assert classify(parse_receipt_text(text, TODAY), text_found) == outcome
