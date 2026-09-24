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
"""

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from apps.categories.models import Category, TransactionType

from .models import Transaction

REQUIRED_COLUMNS = {"date", "description", "amount"}
DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y"]

# keyword(s) -> category name, matched case-insensitively against the
# description; first match wins. Deliberately a flat hardcoded table for
# now ("kezdetben rule-based") — a per-user, DB-backed rule editor is a
# natural later step (the project's own "auto-categorization" roadmap item),
# not built here.
EXPENSE_CATEGORY_RULES: list[tuple[tuple[str, ...], str]] = [
    (("albert heijn", "jumbo", "lidl", "aldi", "tesco", "supermarket", "grocery"), "Food"),
    (
        ("shell", " bp ", "esso", "uber", "taxi", "parking", "metro", "ns.nl", "fuel"),
        "Transport",
    ),
    (
        ("netflix", "spotify", "disney", "hbo", "cinema", "pathe", "steam", "playstation"),
        "Entertainment",
    ),
    (("rent", "mortgage", "huur"), "Housing"),
    (
        (
            "kpn",
            "ziggo",
            "vodafone",
            "t-mobile",
            "electricity",
            "energie",
            "water bill",
            "gas bill",
            "internet",
            "phone bill",
        ),
        "Bills",
    ),
    (
        ("pharmacy", "apotheek", "doctor", "huisarts", "hospital", "dentist", "tandarts"),
        "Health",
    ),
    (("amazon", "zalando", "bol.com", "h&m", "ikea", "mediamarkt"), "Shopping"),
    (("booking.com", "airbnb", "ryanair", "klm", "transavia", "hotel", "flight"), "Travel"),
]
EXPENSE_FALLBACK_CATEGORY = "Other"

INCOME_CATEGORY_RULES: list[tuple[tuple[str, ...], str]] = [
    (("salary", "payroll", "salaris"), "Salary"),
]
# No income fallback exists yet (unlike "Other" for expenses) — an
# unmatched income row fails rather than being silently miscategorized.


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


def _decode_csv_text(uploaded_file) -> str:
    raw = uploaded_file.read()
    if not raw:
        raise CsvValidationError("The uploaded file is empty.")
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
    lowered = f" {description.lower()} "
    rules = (
        EXPENSE_CATEGORY_RULES if transaction_type == TransactionType.EXPENSE else INCOME_CATEGORY_RULES
    )
    for keywords, category_name in rules:
        if any(keyword in lowered for keyword in keywords):
            return category_name
    return EXPENSE_FALLBACK_CATEGORY if transaction_type == TransactionType.EXPENSE else None


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

    summary = ImportSummary()
    seen_in_file: set[tuple[date, Decimal, str]] = set()
    to_create: list[Transaction] = []

    for line_number, raw_row in enumerate(reader, start=2):  # header is line 1
        if not any((value or "").strip() for value in raw_row.values()):
            continue  # blank line — not an error, not counted at all

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
        description = row["description"]

        dedupe_key = (parsed_date, amount, description.lower())
        if dedupe_key in seen_in_file or Transaction.objects.filter(
            user=user, date=parsed_date, amount=amount, description__iexact=description
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
