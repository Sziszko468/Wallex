"""Pure CSV-import logic (no HTTP) — see apps/analytics/services.py for the
same "services module holds the logic, the view stays thin" convention.

Expected CSV format (documented for the client in docs/api-contract.md):
    date,description,amount
    2026-09-10,Albert Heijn,-42.50
    2026-09-01,Salary,3000.00

- date: "YYYY-MM-DD" or "DD/MM/YYYY".
- amount: signed decimal, period as the decimal separator (comma/space/€/$
  are stripped as thousands separators — NOT as an alternate decimal mark).
  Negative -> expense, positive -> income. Zero is rejected.
- description: free text, used for rule-based category detection below.

Amounts are in the user's base currency (a bank export has one account currency).
"""

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.utils.translation import gettext_lazy as _

from apps.categories.models import Category, TransactionType
from apps.categories.rules import match_category_name
from apps.currencies.rates import ONE, has_valid_precision

from .models import Transaction

REQUIRED_COLUMNS = {"date", "description", "amount"}
DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y"]

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


def _decode_csv_text(uploaded_file) -> str:
    raw = uploaded_file.read()
    if not raw:
        raise CsvValidationError(_("The uploaded file is empty."))
    if b"\x00" in raw:
        raise CsvValidationError(_("This doesn't look like a CSV file (it contains binary data)."))
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CsvValidationError(_("Could not read this file as text (unsupported encoding)."))


def _parse_date(raw_value: str) -> date:
    value = raw_value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(_("Unrecognized date '%(value)s' (expected YYYY-MM-DD or DD/MM/YYYY).") % {"value": raw_value})


def _parse_amount(raw_value: str) -> Decimal:
    value = raw_value.strip()
    for token in ("€", "$", "£", ",", " "):
        value = value.replace(token, "")
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

    def __init__(self, user):
        self.user = user
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
        signed_amount = _parsed(_parse_amount, row["amount"])
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


def _open_csv(uploaded_file) -> tuple[csv.DictReader, dict[str, str]]:
    """The reader of a file and its header lookup (lowercased name -> name as written); the whole file
    is refused here when it is not CSV or lacks a required column."""
    reader = csv.DictReader(io.StringIO(_decode_csv_text(uploaded_file)))
    if not reader.fieldnames:
        raise CsvValidationError(_("Could not read this file as CSV."))

    header_lookup = {name.strip().lower(): name for name in reader.fieldnames}
    missing = REQUIRED_COLUMNS - header_lookup.keys()
    if missing:
        raise CsvValidationError(
            _("Missing required column(s): %(columns)s.") % {"columns": ", ".join(sorted(missing))}
        )
    return reader, header_lookup


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
    reader, header_lookup = _open_csv(uploaded_file)
    importer = _RowImporter(user)
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
