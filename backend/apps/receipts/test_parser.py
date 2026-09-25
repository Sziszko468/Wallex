from datetime import date
from decimal import Decimal

import pytest

from apps.receipts.parser import Confidence, extract_amount, extract_date, extract_merchant, parse_receipt_text

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


def test_empty_text():
    parsed = parse_receipt_text("   \n\n", TODAY)
    assert parsed.merchant.value is None
    assert parsed.amount.value is None
    assert parsed.date.value is None
