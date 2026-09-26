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


@dataclass
class RowResult:
    row: int
    status: str  # "skipped" | "failed"
    reason: str


@dataclass
class ImportSummary:
    imported: int = 0
    skipped: int = 0
    failed: int = 0
    details: list[RowResult] = field(default_factory=list)
    # (year, month) pairs that received new expenses — budget checks run for these.
    expense_months: set[tuple[int, int]] = field(default_factory=set)


def _rows(reader):
    """(line number, row) pairs; malformed CSV becomes a clean validation error, not a 500."""
    try:
        yield from enumerate(reader, start=2)  # header is line 1
    except csv.Error as error:
        raise CsvValidationError(f"This file is not valid CSV ({error}).") from error


def _decode_csv_text(uploaded_file) -> str:
    raw = uploaded_file.read()
    if not raw:
        raise CsvValidationError("The uploaded file is empty.")
    if b"\x00" in raw:
        raise CsvValidationError("This doesn't look like a CSV file (it contains binary data).")
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CsvValidationError("Could not read this file as text (unsupported encoding).")


def _parse_date(raw_value: str) -> date:
    value = raw_value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date '{raw_value}' (expected YYYY-MM-DD or DD/MM/YYYY).")


def _parse_amount(raw_value: str) -> Decimal:
    value = raw_value.strip()
    for token in ("€", "$", "£", ",", " "):
        value = value.replace(token, "")
    if not value:
        raise ValueError("Amount is empty.")
    try:
        amount = Decimal(value)
    except InvalidOperation:
        raise ValueError(f"Unrecognized amount '{raw_value}'.")
    if amount == 0:
        raise ValueError("Amount cannot be zero.")
    return amount.quantize(Decimal("0.01"))


def _detect_category_name(description: str, transaction_type: str) -> str | None:
    matched = match_category_name(description, transaction_type)
    if matched is None and transaction_type == TransactionType.EXPENSE:
        return EXPENSE_FALLBACK_CATEGORY
    return matched


def import_transactions_from_csv(user, uploaded_file) -> ImportSummary:
    text = _decode_csv_text(uploaded_file)
    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise CsvValidationError("Could not read this file as CSV.")

    header_lookup = {name.strip().lower(): name for name in reader.fieldnames}
    missing = REQUIRED_COLUMNS - header_lookup.keys()
    if missing:
        raise CsvValidationError(f"Missing required column(s): {', '.join(sorted(missing))}.")

    # Keyed by (lowercased name, type) so same-named income/expense
    # categories (allowed by the model's own uniqueness constraint) can't
    # shadow each other.
    categories_by_name_and_type = {
        (category.name.lower(), category.type): category
        for category in Category.objects.filter(user=user)
    }

    currency = user.base_currency
    summary = ImportSummary()
    seen_in_file: set[tuple[date, Decimal, str]] = set()
    to_create: list[Transaction] = []

    max_rows = settings.CSV_IMPORT_MAX_ROWS
    data_rows = 0
    for line_number, raw_row in _rows(reader):
        if not any((value or "").strip() for value in raw_row.values()):
            continue  # blank line — not an error, not counted at all

        data_rows += 1
        if data_rows > max_rows:
            # Refuse the whole file before anything is saved (bulk_create runs last).
            raise CsvValidationError(f"Too many rows — at most {max_rows} per import.")

        row = {key: (raw_row.get(header_lookup[key]) or "").strip() for key in REQUIRED_COLUMNS}

        if not row["date"] or not row["description"] or not row["amount"]:
            summary.failed += 1
            summary.details.append(
                RowResult(line_number, "failed", "Missing date, description, or amount.")
            )
            continue

        try:
            parsed_date = _parse_date(row["date"])
        except ValueError as error:
            summary.failed += 1
            summary.details.append(RowResult(line_number, "failed", str(error)))
            continue

        try:
            signed_amount = _parse_amount(row["amount"])
        except ValueError as error:
            summary.failed += 1
            summary.details.append(RowResult(line_number, "failed", str(error)))
            continue

        transaction_type = TransactionType.EXPENSE if signed_amount < 0 else TransactionType.INCOME
        amount = abs(signed_amount)
        if not has_valid_precision(amount, currency):
            summary.failed += 1
            summary.details.append(RowResult(line_number, "failed", f"{currency} amounts can't have decimals."))
            continue
        description = row["description"]
        if len(description) > DESCRIPTION_MAX_LENGTH:
            summary.failed += 1
            summary.details.append(
                RowResult(
                    line_number,
                    "failed",
                    f"Description is too long (max {DESCRIPTION_MAX_LENGTH} characters).",
                )
            )
            continue

        dedupe_key = (parsed_date, amount, description.lower())
        if dedupe_key in seen_in_file or Transaction.objects.filter(
            user=user, date=parsed_date, amount=amount, currency=currency, description__iexact=description
        ).exists():
            summary.skipped += 1
            summary.details.append(
                RowResult(line_number, "skipped", "Duplicate of an existing transaction.")
            )
            continue

        category_name = _detect_category_name(description, transaction_type)
        category = (
            categories_by_name_and_type.get((category_name.lower(), transaction_type))
            if category_name
            else None
        )
        if category is None:
            summary.failed += 1
            summary.details.append(
                RowResult(
                    line_number,
                    "failed",
                    f"Could not detect a category for '{description}'.",
                )
            )
            continue

        seen_in_file.add(dedupe_key)
        to_create.append(
            Transaction(
                user=user,
                category=category,
                type=transaction_type,
                amount=amount,
                currency=currency,
                exchange_rate=ONE,
                description=description,
                date=parsed_date,
            )
        )
        summary.imported += 1
        if transaction_type == TransactionType.EXPENSE:
            summary.expense_months.add((parsed_date.year, parsed_date.month))

    if to_create:
        Transaction.objects.bulk_create(to_create)

    return summary
