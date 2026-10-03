"""Pure CSV-import logic (no HTTP) — see apps/analytics/services.py for the
same "services module holds the logic, the view stays thin" convention.

Expected CSV format (documented for the client in docs/api-contract.md):
    date,description,amount
    2026-09-10,Albert Heijn,-42.50
    2026-09-01,Salary,3000.00

- date: "YYYY-MM-DD", "DD/MM/YYYY", or the Hungarian "2026.09.10." / "10.09.2026".
- amount: signed decimal. In a comma-separated file the period is the decimal mark (comma, spaces
  and €/$/£ are thousands separators and signs). In a semicolon-separated file, as Hungarian banks
  export them, the comma is the decimal mark ("-12 345,67"). Negative -> expense, positive ->
  income. Zero is rejected.
- columns: `date`, `description`, `amount`, or the Hungarian names (Dátum, Közlemény, Összeg ...).
- description: free text, used for rule-based category detection below.

Amounts are in the user's base currency (a bank export has one account currency).
"""

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.utils.translation import gettext_lazy as _

from apps.categories.models import Category, TransactionType
from apps.categories.rules import match_category_name, normalize_text
from apps.currencies.rates import ONE, has_valid_precision

from .models import Transaction

REQUIRED_COLUMNS = {"date", "description", "amount"}
# Other names of the three columns (compared lowercase and without accents): English and the headers
# Hungarian banks use.
HEADER_ALIASES = {
    "date": {"date", "datum", "konyveles datuma", "teljesites datuma", "booking date"},
    "description": {
        "description",
        "kozlemeny",
        "megjegyzes",
        "tranzakcio leirasa",
        "partner neve",
        "partner",
        "leiras",
    },
    "amount": {"amount", "osszeg", "tetel osszege", "tranzakcio osszege"},
}
DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%Y.%m.%d.", "%Y.%m.%d", "%d.%m.%Y.", "%d.%m.%Y"]
DELIMITERS = (",", ";", "\t")
# A file separated by semicolons is a European export: its decimal mark is the comma ("12 345,67").
DECIMAL_COMMA_DELIMITER = ";"
SPACES = ("\u00a0", "\u202f", " ")
CURRENCY_SUFFIX = re.compile(r"[A-Za-z]{2,3}$")  # "12 345 Ft", "-42,50 EUR"

EXPENSE_FALLBACK_CATEGORY = "Other"
DESCRIPTION_MAX_LENGTH = Transaction._meta.get_field("description").max_length
# No income fallback exists (unlike "Other" for expenses) — an unmatched
# income row fails rather than being silently miscategorized.


class CsvValidationError(Exception):
    """File-level problem — the whole upload is rejected, no rows processed."""


FAILED = "failed"
SKIPPED = "skipped"


@dataclass
class RowResult:
    row: int
    status: str  # SKIPPED | FAILED
    reason: str


@dataclass
class ImportSummary:
    imported: int = 0
    skipped: int = 0
    failed: int = 0
    details: list[RowResult] = field(default_factory=list)
    # (year, month) pairs that received new expenses — budget checks run for these.
    expense_months: set[tuple[int, int]] = field(default_factory=set)

    def reject(self, line_number: int, rejected: "RowRejected") -> None:
        if rejected.status == SKIPPED:
            self.skipped += 1
        else:
            self.failed += 1
        self.details.append(RowResult(line_number, rejected.status, rejected.reason))


def _rows(reader):
    """(line number, row) pairs; malformed CSV becomes a clean validation error, not a 500."""
    try:
        yield from enumerate(reader, start=2)  # header is line 1
    except csv.Error as error:
        raise CsvValidationError(_("This file is not valid CSV (%(error)s).") % {"error": error}) from error


def _decode_csv_text(uploaded_file, user) -> str:
    raw = uploaded_file.read()
    if not raw:
        raise CsvValidationError(_("The uploaded file is empty."))
    if b"\x00" in raw:
        raise CsvValidationError(_("This doesn't look like a CSV file (it contains binary data)."))
    # Hungarian bank exports are often Windows-1250 ("ő" and "ű" don't exist in Latin-1).
    fallbacks = ("cp1250", "latin-1") if user.language == "hu" else ("latin-1",)
    for encoding in ("utf-8-sig", *fallbacks):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CsvValidationError(_("Could not read this file as text (unsupported encoding)."))


def _parse_date(raw_value: str) -> date:
    value = re.sub(r"\.\s+", ".", raw_value.strip())  # "2026. 09. 10." as some banks write it
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(_("Unrecognized date '%(value)s' (expected YYYY-MM-DD or DD/MM/YYYY).") % {"value": raw_value})


def _clean_amount(raw_value: str, decimal_comma: bool) -> str:
    """The digits of a typed amount with a dot as decimal mark: separators and currency signs removed.

    Comma files ("1,234.50"): a comma groups thousands. Semicolon files ("1 234,50"): the comma is the
    decimal mark and a dot groups thousands, as Hungarian and other European banks write them."""
    value = CURRENCY_SUFFIX.sub("", raw_value.strip()).strip()
    for token in ("€", "$", "£", *SPACES):
        value = value.replace(token, "")
    if decimal_comma and "," in value:
        return value.replace(".", "").replace(",", ".")
    return value if decimal_comma else value.replace(",", "")


def _parse_amount(raw_value: str, decimal_comma: bool = False) -> Decimal:
    value = _clean_amount(raw_value, decimal_comma)
    if not value:
        raise ValueError(_("Amount is empty."))
    try:
        amount = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(_("Unrecognized amount '%(value)s'.") % {"value": raw_value}) from error
    if amount == 0:
        raise ValueError(_("Amount cannot be zero."))
    return amount.quantize(Decimal("0.01"))


def _detect_category_name(description: str, transaction_type: str) -> str | None:
    matched = match_category_name(description, transaction_type)
    if matched is None and transaction_type == TransactionType.EXPENSE:
        return EXPENSE_FALLBACK_CATEGORY
    return matched


class RowRejected(Exception):
    """One row can't be imported (`failed`) or needn't be (`skipped`); the rest of the file still can."""

    def __init__(self, status: str, reason: str):
        super().__init__(reason)
        self.status = status
        self.reason = reason


def _failed(reason: str) -> RowRejected:
    return RowRejected(FAILED, reason)


def _parsed(parser, raw_value: str):
    """`parser(raw_value)`, with a bad value turned into a rejected row."""
    try:
        return parser(raw_value)
    except ValueError as error:
        raise _failed(str(error)) from error


class _RowImporter:
    """Turns the rows of one file into transactions of one user, or says why a row can't be one."""

    def __init__(self, user, decimal_comma: bool = False):
        self.user = user
        self.decimal_comma = decimal_comma
        self.currency = user.base_currency
        # Keyed by (lowercased name, type) so same-named income/expense categories (allowed by the
        # model's own uniqueness constraint) can't shadow each other.
        self.categories = {(category.name.lower(), category.type): category for category in user.categories.all()}
        self.seen_in_file: set[tuple[date, Decimal, str]] = set()

    def build(self, row: dict[str, str]) -> Transaction:
        """The transaction for a row of `date`, `description` and `amount`; raises RowRejected."""
        if not all(row.values()):
            raise _failed(_("Missing date, description, or amount."))

        day = _parsed(_parse_date, row["date"])
        signed_amount = _parsed(lambda raw: _parse_amount(raw, self.decimal_comma), row["amount"])
        transaction_type = TransactionType.EXPENSE if signed_amount < 0 else TransactionType.INCOME
        amount = abs(signed_amount)
        description = row["description"]
        self._check_size(amount, description)

        dedupe_key = (day, amount, description.lower())
        if self._is_duplicate(dedupe_key, day, amount, description):
            raise RowRejected(SKIPPED, _("Duplicate of an existing transaction."))
        category = self._category_for(description, transaction_type)

        self.seen_in_file.add(dedupe_key)
        return Transaction(
            user=self.user,
            category=category,
            type=transaction_type,
            amount=amount,
            currency=self.currency,
            exchange_rate=ONE,
            description=description,
            date=day,
        )

    def _check_size(self, amount: Decimal, description: str) -> None:
        if not has_valid_precision(amount, self.currency):
            raise _failed(_("%(currency)s amounts can't have decimals.") % {"currency": self.currency})
        if len(description) > DESCRIPTION_MAX_LENGTH:
            raise _failed(_("Description is too long (max %(max)s characters).") % {"max": DESCRIPTION_MAX_LENGTH})

    def _is_duplicate(self, dedupe_key, day: date, amount: Decimal, description: str) -> bool:
        return (
            dedupe_key in self.seen_in_file
            or Transaction.objects.filter(
                user=self.user, date=day, amount=amount, currency=self.currency, description__iexact=description
            ).exists()
        )

    def _category_for(self, description: str, transaction_type: str) -> Category:
        name = _detect_category_name(description, transaction_type)
        category = self.categories.get((name.lower(), transaction_type)) if name else None
        if category is None:
            raise _failed(_("Could not detect a category for '%(description)s'.") % {"description": description})
        return category


def _delimiter_of(csv_text: str) -> str:
    """The separator a file's header line uses: the one it has most of, comma when it has none."""
    header = next((line for line in csv_text.lstrip("\ufeff").splitlines() if line.strip()), "")
    counts = {delimiter: header.count(delimiter) for delimiter in DELIMITERS}
    best = max(counts, key=counts.get)
    return best if counts[best] else DELIMITERS[0]


def _header_lookup(fieldnames) -> dict[str, str]:
    """Which header of the file holds each of the three columns (first match wins)."""
    lookup: dict[str, str] = {}
    for fieldname in fieldnames:
        key = normalize_text(fieldname or "").strip()
        for column, aliases in HEADER_ALIASES.items():
            if key in aliases and column not in lookup:
                lookup[column] = fieldname
    return lookup


def _open_csv(uploaded_file, user) -> tuple[csv.DictReader, dict[str, str], bool]:
    """The reader of a file, which header holds each column, and whether amounts use a decimal comma;
    the whole file is refused here when it is not CSV or lacks a required column."""
    csv_text = _decode_csv_text(uploaded_file, user)
    delimiter = _delimiter_of(csv_text)
    reader = csv.DictReader(io.StringIO(csv_text), delimiter=delimiter)
    if not reader.fieldnames:
        raise CsvValidationError(_("Could not read this file as CSV."))

    header_lookup = _header_lookup(reader.fieldnames)
    missing = REQUIRED_COLUMNS - header_lookup.keys()
    if missing:
        raise CsvValidationError(
            _("Missing required column(s): %(columns)s.") % {"columns": ", ".join(sorted(missing))}
        )
    return reader, header_lookup, delimiter == DECIMAL_COMMA_DELIMITER


def _data_rows(reader, header_lookup: dict[str, str]):
    """(line number, {column: stripped text}) of every row that has anything in it.

    A blank line is not an error and is not counted. A file over the row limit is refused as a
    whole, before anything is saved (the caller saves last)."""
    max_rows = settings.CSV_IMPORT_MAX_ROWS
    counted = 0
    for line_number, raw_row in _rows(reader):
        if not any((value or "").strip() for value in raw_row.values()):
            continue
        counted += 1
        if counted > max_rows:
            raise CsvValidationError(_("Too many rows — at most %(max_rows)s per import.") % {"max_rows": max_rows})
        yield line_number, {key: (raw_row.get(header_lookup[key]) or "").strip() for key in REQUIRED_COLUMNS}


def import_transactions_from_csv(user, uploaded_file) -> ImportSummary:
    reader, header_lookup, decimal_comma = _open_csv(uploaded_file, user)
    importer = _RowImporter(user, decimal_comma)
    summary = ImportSummary()
    to_create: list[Transaction] = []

    for line_number, row in _data_rows(reader, header_lookup):
        try:
            transaction = importer.build(row)
        except RowRejected as rejected:
            summary.reject(line_number, rejected)
            continue
        to_create.append(transaction)
        summary.imported += 1
        if transaction.type == TransactionType.EXPENSE:
            summary.expense_months.add((transaction.date.year, transaction.date.month))

    if to_create:
        Transaction.objects.bulk_create(to_create)
    return summary
