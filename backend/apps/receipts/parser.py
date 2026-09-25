"""Turns OCR text into merchant / amount / date — pure functions, no I/O.

Rule-based and deliberately cautious: every field comes with a confidence,
and a value the rules can't find is returned as None rather than guessed.
The user always confirms (and can correct) the result before anything is
saved, so "low confidence" is a UI hint, never a reason to save silently.
"""

import re
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from enum import StrEnum
from typing import Generic, TypeVar

from apps.categories.models import TransactionType
from apps.categories.rules import match_category_name, normalize_text

T = TypeVar("T")

MAX_AMOUNT = Decimal("9999999999.99")  # Transaction.amount: max_digits=12, decimal_places=2
OLDEST_PLAUSIBLE_YEAR = 2000
MERCHANT_SEARCH_LINES = 8
MERCHANT_MAX_LENGTH = 100


class Confidence(StrEnum):
    HIGH = "high"  # found by a specific rule (e.g. on the "TOTAL" line)
    LOW = "low"  # best guess — highlight it for the user to check


@dataclass(frozen=True)
class Extracted(Generic[T]):
    value: T | None
    confidence: Confidence

    @classmethod
    def missing(cls) -> "Extracted[T]":
        return cls(None, Confidence.LOW)


@dataclass(frozen=True)
class ParsedReceipt:
    merchant: Extracted[str]
    amount: Extracted[Decimal]
    date: Extracted[date]


# --- Amount ------------------------------------------------------------------

# Strongest signal first. Matched against accent-free lowercase text.
TOTAL_KEYWORDS: list[tuple[str, ...]] = [
    ("fizetendo", "vegosszeg", "amount due", "grand total", "te betalen", "zu zahlen"),
    ("osszesen", "osszeg", "total", "summe", "totaal", "gesamt"),
    ("bankkartya", "kartya", "card"),
]
# Lines that carry an amount but never the total paid.
NOT_TOTAL_KEYWORDS = (
    "subtotal", "sub total", "reszosszeg", "afa", "vat", "tax", "btw", "mwst",
    "visszajaro", "change", "keszpenz", "cash", "kedvezmeny", "discount", "megtakaritas",
)

# 1 234,50 · 1.234,50 · 1,234.50 · 12.99 · 12,99 · 4590 · 4 590
AMOUNT_PATTERN = re.compile(
    r"(?<![\d.,])(\d{1,3}(?:[ .,]\d{3})+|\d+)(?:([.,])(\d{2}))?(?![\d.,]*\d)"
)


def _amounts_in(line: str) -> list[Decimal]:
    amounts = []
    for match in AMOUNT_PATTERN.finditer(line):
        integer = re.sub(r"[ .,]", "", match.group(1))
        cents = match.group(3) or "00"
        value = Decimal(f"{integer}.{cents}")
        if Decimal("0") < value <= MAX_AMOUNT:
            amounts.append(value)
    return amounts


def _without_dates(line: str) -> str:
    """Dates and times look like amounts ("2026.09.24", "14:05") — blank them out first."""
    line = DATE_YMD.sub(" ", line)
    line = DATE_DMY.sub(" ", line)
    return re.sub(r"\b\d{1,2}:\d{2}(?::\d{2})?\b", " ", line)


def extract_amount(lines: list[str]) -> Extracted[Decimal]:
    normalized = [_without_dates(normalize_text(line)) for line in lines]

    for keywords in TOTAL_KEYWORDS:
        for index, line in enumerate(normalized):
            if not any(keyword in line for keyword in keywords):
                continue
            if any(excluded in line for excluded in NOT_TOTAL_KEYWORDS):
                continue
            # The value is usually on the same line, sometimes printed right below it.
            amounts = _amounts_in(line) or (_amounts_in(normalized[index + 1]) if index + 1 < len(normalized) else [])
            if amounts:
                return Extracted(amounts[-1], Confidence.HIGH)

    # No total line recognized: the largest amount is the most likely total, but only a guess.
    candidates = [
        amount
        for line in normalized
        if not any(excluded in line for excluded in NOT_TOTAL_KEYWORDS)
        for amount in _amounts_in(line)
    ]
    return Extracted(max(candidates), Confidence.LOW) if candidates else Extracted.missing()


# --- Date --------------------------------------------------------------------

# 2026.09.24. · 2026-09-24 · 2026/09/24 · 2026. 09. 24.
DATE_YMD = re.compile(r"\b((?:19|20)\d{2})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(\d{1,2})\b")
# 24.09.2026 · 24/09/2026 · 24-09-26
DATE_DMY = re.compile(r"\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4}|\d{2})\b")


def _valid_date(year: int, month: int, day: int, today: date) -> date | None:
    try:
        candidate = date(year, month, day)
    except ValueError:
        return None
    # Allow tomorrow: the receipt's time zone may be ahead of the server's.
    if candidate.year < OLDEST_PLAUSIBLE_YEAR or candidate > today + timedelta(days=1):
        return None
    return candidate


def extract_date(lines: list[str], today: date) -> Extracted[date]:
    for line in lines:
        for match in DATE_YMD.finditer(line):
            found = _valid_date(int(match.group(1)), int(match.group(2)), int(match.group(3)), today)
            if found:
                return Extracted(found, Confidence.HIGH)

        for match in DATE_DMY.finditer(line):
            first, second, raw_year = int(match.group(1)), int(match.group(2)), match.group(3)
            year = int(raw_year) + 2000 if len(raw_year) == 2 else int(raw_year)
            # Day-first (European) unless that's impossible; ambiguous or 2-digit years are guesses.
            day, month = (second, first) if first <= 12 < second else (first, second)
            found = _valid_date(year, month, day, today)
            if found:
                ambiguous = len(raw_year) == 2 or (first <= 12 and second <= 12 and first != second)
                return Extracted(found, Confidence.LOW if ambiguous else Confidence.HIGH)

    return Extracted.missing()


# --- Merchant ----------------------------------------------------------------

COMPANY_SUFFIX = re.compile(r"\b(kft|zrt|nyrt|bt|kkt|gmbh|b\.?v|ltd|inc|llc|s\.?r\.?o|sp\.? z o\.?o)\b\.?")
NOT_MERCHANT_KEYWORDS = (
    "nyugta", "blokk", "receipt", "szamla", "invoice", "adoszam", "tax id", "vat no",
    "cim:", "address", "tel:", "tel.", "telefon", "www.", "http", "koszonjuk", "thank you", "udvozoljuk", "welcome",
)


def _clean(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip(" -*=#:.")[:MERCHANT_MAX_LENGTH]


def _looks_like_name(line: str) -> bool:
    letters = sum(char.isalpha() for char in line)
    return letters >= 3 and letters / max(len(line.replace(" ", "")), 1) >= 0.5


def extract_merchant(lines: list[str]) -> Extracted[str]:
    head = [line for line in lines[:MERCHANT_SEARCH_LINES] if line.strip()]

    # 1. A line naming a merchant we have a category rule for ("TESCO", "SPAR").
    for line in head:
        if match_category_name(line, TransactionType.EXPENSE) and _looks_like_name(line):
            return Extracted(_clean(line), Confidence.HIGH)

    # 2. The registered company name ("... Kft.", "... GmbH").
    for line in head:
        if COMPANY_SUFFIX.search(normalize_text(line)) and _looks_like_name(line):
            return Extracted(_clean(line), Confidence.HIGH)

    # 3. Otherwise the first name-like line at the top — usually the shop's name.
    for line in head:
        normalized = normalize_text(line)
        if _looks_like_name(line) and not any(keyword in normalized for keyword in NOT_MERCHANT_KEYWORDS):
            return Extracted(_clean(line), Confidence.LOW)

    return Extracted.missing()


def parse_receipt_text(text: str, today: date) -> ParsedReceipt:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return ParsedReceipt(
        merchant=extract_merchant(lines),
        amount=extract_amount(lines),
        date=extract_date(lines, today),
    )
