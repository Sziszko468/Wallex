"""Turns OCR text into merchant / amount / date / currency / items — pure functions, no I/O.

Rule-based and deliberately cautious: every field comes with a confidence,
and a value the rules can't find is returned as None rather than guessed.
The user always confirms (and can correct) the result before anything is
saved, so "low confidence" is a UI hint, never a reason to save silently.
"""

import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from enum import StrEnum

from apps.categories.models import TransactionType
from apps.categories.rules import match_category_name, normalize_text
from apps.common.constants import MONTHS_PER_YEAR

MAX_AMOUNT = Decimal("9999999999.99")  # Transaction.amount: max_digits=12, decimal_places=2
OLDEST_PLAUSIBLE_YEAR = 2000
TWO_DIGIT_YEAR_BASE = 2000  # "26" on a receipt means 2026
TWO_DIGIT_YEAR_LENGTH = 2
MIN_NAME_LETTERS = 3  # fewer letters than this is a number or a symbol, not a name
MIN_NAME_LETTER_SHARE = 0.5  # at least half of a merchant line must be letters
MERCHANT_SEARCH_LINES = 8
MERCHANT_MAX_LENGTH = 100


class Confidence(StrEnum):
    HIGH = "high"  # found by a specific rule (e.g. on the "TOTAL" line)
    LOW = "low"  # best guess — highlight it for the user to check


@dataclass(frozen=True)
class Extracted[T]:
    value: T | None
    confidence: Confidence

    @classmethod
    def missing(cls) -> "Extracted[T]":
        return cls(None, Confidence.LOW)


@dataclass(frozen=True)
class ReceiptItem:
    name: str
    amount: Decimal


class Outcome(StrEnum):
    """What the scan amounts to — tells the app which screen to show."""

    COMPLETE = "complete"  # merchant, total, date and currency all read
    INCOMPLETE = "incomplete"  # a receipt, but some fields are missing: the user fills them in
    UNSUPPORTED = "unsupported"  # text, but neither a total nor a date: not a receipt, or a layout we can't read
    UNREADABLE = "unreadable"  # no text at all: blurry, dark, or not a photo of a document


@dataclass(frozen=True)
class ParsedReceipt:
    merchant: Extracted[str]
    amount: Extracted[Decimal]
    date: Extracted[date]
    currency: Extracted[str] = field(default_factory=Extracted.missing)
    # A currency printed on the receipt that WALLEX can't record (e.g. "CZK"), if no supported one was.
    unsupported_currency: str | None = None
    items: list[ReceiptItem] = field(default_factory=list)


# --- Amount ------------------------------------------------------------------

# Strongest signal first. Matched against accent-free lowercase text.
TOTAL_KEYWORDS: list[tuple[str, ...]] = [
    ("fizetendo", "vegosszeg", "amount due", "grand total", "te betalen", "zu zahlen"),
    ("osszesen", "osszeg", "total", "summe", "totaal", "gesamt", "celkem", "razem"),
    ("bankkartya", "kartya", "card"),
]
# Lines that carry an amount but never the total paid.
NOT_TOTAL_KEYWORDS = (
    "subtotal",
    "sub total",
    "reszosszeg",
    "afa",
    "vat",
    "tax",
    "btw",
    "mwst",
    "visszajaro",
    "change",
    "keszpenz",
    "cash",
    "kedvezmeny",
    "discount",
    "megtakaritas",
)

# 1 234,50 · 1.234,50 · 1,234.50 · 12.99 · 12,99 · 4590 · 4 590
AMOUNT_PATTERN = re.compile(r"(?<![\d.,])(\d{1,3}(?:[ .,]\d{3})+|\d+)(?:([.,])(\d{2}))?(?![\d.,]*\d)")


def _amount_of(match: re.Match) -> Decimal | None:
    integer = re.sub(r"[ .,]", "", match.group(1))
    value = Decimal(f"{integer}.{match.group(3) or '00'}")
    return value if Decimal("0") < value <= MAX_AMOUNT else None


def _amounts_in(line: str) -> list[Decimal]:
    return [amount for match in AMOUNT_PATTERN.finditer(line) if (amount := _amount_of(match)) is not None]


def _without_dates(line: str) -> str:
    """Dates and times look like amounts ("2026.09.24", "14:05") — blank them out first."""
    line = DATE_YMD.sub(" ", line)
    line = DATE_DMY.sub(" ", line)
    return re.sub(r"\b\d{1,2}:\d{2}(?::\d{2})?\b", " ", line)


def _find_total(normalized: list[str]) -> tuple[int, Decimal] | None:
    """(index of the total line, total) on the strongest total keyword, if any."""
    for keywords in TOTAL_KEYWORDS:
        for index, line in enumerate(normalized):
            if not any(keyword in line for keyword in keywords):
                continue
            if any(excluded in line for excluded in NOT_TOTAL_KEYWORDS):
                continue
            # The value is usually on the same line, sometimes printed right below it.
            amounts = _amounts_in(line) or (_amounts_in(normalized[index + 1]) if index + 1 < len(normalized) else [])
            if amounts:
                return index, amounts[-1]
    return None


def extract_amount(lines: list[str]) -> Extracted[Decimal]:
    normalized = [_without_dates(normalize_text(line)) for line in lines]

    total = _find_total(normalized)
    if total is not None:
        return Extracted(total[1], Confidence.HIGH)

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
            year = int(raw_year) + TWO_DIGIT_YEAR_BASE if len(raw_year) == TWO_DIGIT_YEAR_LENGTH else int(raw_year)
            # Day-first (European) unless that's impossible; ambiguous or 2-digit years are guesses.
            day, month = (second, first) if first <= MONTHS_PER_YEAR < second else (first, second)
            found = _valid_date(year, month, day, today)
            if found:
                ambiguous = len(raw_year) == TWO_DIGIT_YEAR_LENGTH or (
                    first <= MONTHS_PER_YEAR and second <= MONTHS_PER_YEAR and first != second
                )
                return Extracted(found, Confidence.LOW if ambiguous else Confidence.HIGH)

    return Extracted.missing()


# --- Merchant ----------------------------------------------------------------

COMPANY_SUFFIX = re.compile(r"\b(kft|zrt|nyrt|bt|kkt|gmbh|b\.?v|ltd|inc|llc|s\.?r\.?o|sp\.? z o\.?o)\b\.?")
NOT_MERCHANT_KEYWORDS = (
    "nyugta",
    "blokk",
    "receipt",
    "szamla",
    "invoice",
    "adoszam",
    "tax id",
    "vat no",
    "cim:",
    "address",
    "tel:",
    "tel.",
    "telefon",
    "www.",
    "http",
    "koszonjuk",
    "thank you",
    "udvozoljuk",
    "welcome",
)


def _clean(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip(" -*=#:.")[:MERCHANT_MAX_LENGTH]


def _looks_like_name(line: str) -> bool:
    letters = sum(char.isalpha() for char in line)
    return letters >= MIN_NAME_LETTERS and letters / max(len(line.replace(" ", "")), 1) >= MIN_NAME_LETTER_SHARE


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

    # 3. Otherwise the first name-like line at the top — usually the shop's name. Never a line
    #    about money ("ÖSSZESEN 2 056 Ft"): a receipt without a readable name has no merchant.
    money_keywords = (*[keyword for group in TOTAL_KEYWORDS for keyword in group], *NOT_TOTAL_KEYWORDS)
    for line in head:
        normalized = normalize_text(line)
        if (
            _looks_like_name(line)
            and not any(keyword in normalized for keyword in NOT_MERCHANT_KEYWORDS)
            and not any(keyword in normalized for keyword in money_keywords)
        ):
            return Extracted(_clean(line), Confidence.LOW)

    return Extracted.missing()


# --- Currency ----------------------------------------------------------------


def _marker(token: str) -> str:
    """A currency word or code, not glued to other letters ("ft" in "2 056 Ft", not in "soft")."""
    return rf"(?<![^\W\d_]){token}(?![^\W\d_])"


# Matched against accent-free lowercase text (normalize_text: "Kč" -> "kc").
SUPPORTED_CURRENCY_MARKERS: list[tuple[re.Pattern, str]] = [
    (re.compile("|".join([_marker("huf"), _marker("ft"), _marker("forint")])), "HUF"),
    (re.compile("|".join(["€", _marker("eur"), _marker("euro")])), "EUR"),
    (re.compile("|".join([r"\$", _marker("usd")])), "USD"),
    (re.compile("|".join(["£", _marker("gbp")])), "GBP"),
    (re.compile(_marker("chf")), "CHF"),
    (re.compile("|".join(["¥", "円", _marker("jpy")])), "JPY"),
]
# Currencies seen on receipts around Hungary (and a few symbols) that WALLEX can't record.
UNSUPPORTED_CURRENCY_MARKERS: list[tuple[re.Pattern, str]] = [
    (re.compile("|".join([_marker("czk"), _marker("kc")])), "CZK"),
    (re.compile("|".join([_marker("pln"), _marker("zł"), _marker("zl")])), "PLN"),
    (re.compile("|".join([_marker("ron"), _marker("lei")])), "RON"),
    (re.compile(_marker("rsd")), "RSD"),
    (re.compile(_marker("sek")), "SEK"),
    (re.compile(_marker("nok")), "NOK"),
    (re.compile(_marker("dkk")), "DKK"),
    (re.compile("₺"), "TRY"),
    (re.compile("₹"), "INR"),
    (re.compile("₴|" + _marker("uah")), "UAH"),
]


def _count_markers(text: str, markers: list[tuple[re.Pattern, str]]) -> Counter:
    return Counter({code: len(pattern.findall(text)) for pattern, code in markers if pattern.search(text)})


def extract_currency(lines: list[str]) -> tuple[Extracted[str], str | None]:
    """(the receipt's currency if WALLEX supports it, an unsupported one printed instead).

    High confidence when exactly one currency appears; when several do (a price list in
    EUR with a HUF total…), the most frequent one is a low-confidence guess.
    """
    text = normalize_text("\n".join(lines))
    supported = _count_markers(text, SUPPORTED_CURRENCY_MARKERS)
    unsupported = _count_markers(text, UNSUPPORTED_CURRENCY_MARKERS)
    if supported:
        code = supported.most_common(1)[0][0]
        confident = len(supported) == 1 and not unsupported
        return Extracted(code, Confidence.HIGH if confident else Confidence.LOW), None
    if unsupported:
        return Extracted.missing(), unsupported.most_common(1)[0][0]
    return Extracted.missing(), None


# --- Items -------------------------------------------------------------------

MAX_ITEMS = 50
ITEM_NAME_MAX_LENGTH = 100
# Street names end in a house number, which would otherwise read as a price.
ADDRESS_KEYWORDS = (" ut ", " utca", " u. ", " ter ", " krt", "korut", " street", " st. ", " road", "strasse", " str. ")
# Quantity markers: "1 DB", "2 x", "3 pcs", "*". A line that is nothing but a quantity ("2 DB X 199",
# printed under its item) carries a unit price, not an item.
QUANTITY_TOKENS = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:db|pcs|pc|stk|x)\b|\b(?:db|pcs|stk|x)\b|[*×]", re.IGNORECASE)
# What follows a price: a currency sign or code, and/or a VAT letter ("549 C", "12.99 €", "1 346 Ft", "12,90 Kč").
TRAILING_PRICE_NOISE = re.compile(r"(?:[\s€$£¥]*[^\W\d_]{0,3}\.?){0,2}\s*$")


def _looks_like_item_name(text: str) -> bool:
    """Product names often carry numbers ("TEJ 2,8% 1L"): three letters besides quantity markers are enough."""
    return sum(char.isalpha() for char in QUANTITY_TOKENS.sub("", text)) >= MIN_NAME_LETTERS


def _is_item_line(normalized: str) -> bool:
    padded = f" {normalized} "
    keywords = (
        *[keyword for group in TOTAL_KEYWORDS for keyword in group],
        *NOT_TOTAL_KEYWORDS,
        *NOT_MERCHANT_KEYWORDS,
    )
    return not any(keyword in normalized for keyword in keywords) and not any(
        keyword in padded for keyword in ADDRESS_KEYWORDS
    )


def extract_items(lines: list[str]) -> list[ReceiptItem]:
    """The purchased lines above the total: a name followed by its price. Informational only —
    the total is read from the TOTAL line, never summed from items."""
    normalized = [_without_dates(normalize_text(line)) for line in lines]
    total = _find_total(normalized)
    end, total_amount = total if total else (len(lines), None)

    items: list[ReceiptItem] = []
    for line, normalized_line in zip(lines[:end], normalized[:end], strict=True):
        if not _is_item_line(normalized_line):
            continue
        text = _without_dates(line)
        body = TRAILING_PRICE_NOISE.sub("", text)
        matches = list(AMOUNT_PATTERN.finditer(body))
        if not matches or matches[-1].end() != len(body.rstrip()):
            continue  # the price must end the line
        amount = _amount_of(matches[-1])
        name = _clean(body[: matches[-1].start()])[:ITEM_NAME_MAX_LENGTH]
        if amount is None or not _looks_like_item_name(name) or (total_amount is not None and amount > total_amount):
            continue
        items.append(ReceiptItem(name, amount))
        if len(items) == MAX_ITEMS:
            break
    return items


# --- Result ------------------------------------------------------------------


def classify(parsed: ParsedReceipt, text_found: bool) -> Outcome:
    if not text_found:
        return Outcome.UNREADABLE
    if parsed.amount.value is None and parsed.date.value is None:
        return Outcome.UNSUPPORTED
    fields = (parsed.merchant, parsed.amount, parsed.date, parsed.currency)
    return Outcome.COMPLETE if all(field.value is not None for field in fields) else Outcome.INCOMPLETE


def parse_receipt_text(text: str, today: date) -> ParsedReceipt:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    currency, unsupported_currency = extract_currency(lines)
    return ParsedReceipt(
        merchant=extract_merchant(lines),
        amount=extract_amount(lines),
        date=extract_date(lines, today),
        currency=currency,
        unsupported_currency=unsupported_currency,
        items=extract_items(lines),
    )
