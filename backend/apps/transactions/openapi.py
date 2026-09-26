"""OpenAPI documentation for transactions, CSV import and recurring transactions."""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import serializers

from apps.common.openapi import error_response, upload_too_large, validation_error

from .serializers import RecurringTransactionSerializer, TransactionSerializer

IMPORT_ROW_STATUS_CHOICES = [("skipped", "skipped"), ("failed", "failed")]

# --- Transactions ----------------------------------------------------------------------------

_TRANSACTION_EXAMPLE = {
    "id": 116,
    "amount": "45.90",
    "currency": "EUR",
    "exchange_rate": "1.0000000000",
    "base_amount": "45.90",
    "type": "expense",
    "category": 206,
    "description": "Monthly gym pass",
    "date": "2026-09-12",
    "client_id": None,
    "created_at": "2026-09-26T09:49:57.360831Z",
    "updated_at": "2026-09-26T09:49:57.360857Z",
}

_TRANSACTION_VALIDATION = validation_error(
    ("Type differs from category", {"type": ["Transaction type must match the selected category's type."]}),
    ("Amount too small", {"amount": ["Ensure this value is greater than or equal to 0.01."]}),
    ("Too many decimals", {"amount": ["Ensure that there are no more than 2 decimal places."]}),
    ("Unknown or foreign category", {"category": ['Invalid pk "999999" - object does not exist.']}),
    ("Bad date", {"date": ["Date has wrong format. Use one of these formats instead: YYYY-MM-DD."]}),
    ("Bad client_id", {"client_id": ["Must be a valid UUID."]}),
    ("Unknown currency", {"currency": ['"XYZ" is not a valid choice.']}),
    ("Fractional forints", {"amount": ["HUF amounts can't have decimals."]}),
    (
        "No exchange rate",
        {"exchange_rate": ["No HUF exchange rate is available for 2026-09-26. Enter the rate manually or try again later."]},
    ),
    ("Rate for the base currency", {"exchange_rate": ["Must be 1 when the currency is your base currency."]}),
    ("Missing fields", {"category": ["This field is required."], "date": ["This field is required."]}),
)

_LIST_PARAMETERS = [
    OpenApiParameter(
        "type", OpenApiTypes.STR, enum=["income", "expense"], description="Only income or only expense transactions."
    ),
    OpenApiParameter("category", OpenApiTypes.INT, description="Category id; must be one of the user's categories."),
    OpenApiParameter(
        "category_name", OpenApiTypes.STR, description="Category name, exact match ignoring case (e.g. `food`)."
    ),
    OpenApiParameter("date_from", OpenApiTypes.DATE, description="Only transactions on or after this date."),
    OpenApiParameter("date_to", OpenApiTypes.DATE, description="Only transactions on or before this date."),
    OpenApiParameter("search", OpenApiTypes.STR, description="Case-insensitive substring of `description`."),
    OpenApiParameter(
        "ordering",
        OpenApiTypes.STR,
        description=(
            "Sort by `date`, `base_amount` (the value in the base currency: use it to sort by size), `amount` "
            "(the raw number in each transaction's own currency) or `created_at`; prefix `-` for descending, "
            "comma-separate for several (`-base_amount,date`). Default: `-date,-created_at` (newest first). "
            "Unknown fields are ignored."
        ),
    ),
    OpenApiParameter("page", OpenApiTypes.INT, description="Page number, starting at 1."),
    OpenApiParameter("page_size", OpenApiTypes.INT, description="Results per page. Default 20, max 100."),
]

TRANSACTION_VIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=["Transactions"],
        summary="List transactions",
        description=(
            "The user's transactions, newest first, **paginated** (`count`, `next`, `previous`, `results`). "
            "All filters can be combined; `date_from` + `date_to` give a date range."
        ),
        parameters=_LIST_PARAMETERS,
        responses={
            200: OpenApiResponse(TransactionSerializer(many=True), description="One page of transactions."),
            400: validation_error(
                ("Invalid filters", {
                    "type": ["Select a valid choice. foo is not one of the available choices."],
                    "category": ["Select a valid choice. That choice is not one of the available choices."],
                    "date_from": ["Enter a valid date."],
                }),
                description="A filter value is invalid.",
            ),
            404: error_response("`page` is past the last page.", ("Past the end", {"detail": "Invalid page."})),
        },
    ),
    create=extend_schema(
        tags=["Transactions"],
        summary="Create a transaction",
        description=(
            "`type` must equal the category's type; `amount` is positive with at most 2 decimals "
            "(whole numbers for HUF and JPY).\n\n"
            "**Currency:** `amount` is stored in `currency` exactly as sent (default: the user's base currency). "
            "`exchange_rate` is fixed now: the ECB reference rate of `date`, or of the last publication at most "
            "7 days before it, unless you send one yourself. `base_amount` (`amount × exchange_rate`, in the "
            "base currency) is what every total adds up.\n\n"
            "**Idempotency:** send a `client_id` (UUID, generated once per transaction) to make retries safe. "
            "If a transaction with the same `client_id` already exists, it is returned with `200` and "
            "nothing new is created — the body of the retry is ignored.\n\n"
            "Creating an expense re-checks the month's budgets and may send a budget push notification."
        ),
        responses={
            201: OpenApiResponse(TransactionSerializer, description="Created."),
            200: OpenApiResponse(
                TransactionSerializer, description="Replay of an already stored `client_id`: the existing transaction."
            ),
            400: _TRANSACTION_VALIDATION,
        },
        examples=[
            OpenApiExample(
                "Expense",
                request_only=True,
                value={
                    "amount": "45.90",
                    "type": "expense",
                    "category": 206,
                    "description": "Monthly gym pass",
                    "date": "2026-09-12",
                },
            ),
            OpenApiExample(
                "In another currency",
                request_only=True,
                value={
                    "amount": "15000",
                    "currency": "HUF",
                    "type": "expense",
                    "category": 202,
                    "description": "Lunch in Budapest",
                    "date": "2026-09-25",
                },
            ),
            OpenApiExample(
                "Offline-safe (with client_id)",
                request_only=True,
                value={
                    "amount": "2500.00",
                    "type": "income",
                    "category": 9,
                    "description": "Salary",
                    "date": "2026-09-01",
                    "client_id": "3f2b7c1e-8a4d-4f6b-9c2e-1d5a7b9e0f13",
                },
            ),
            OpenApiExample("Created", response_only=True, status_codes=["201"], value=_TRANSACTION_EXAMPLE),
        ],
    ),
    retrieve=extend_schema(tags=["Transactions"], summary="Get a transaction", responses={200: TransactionSerializer}),
    update=extend_schema(
        tags=["Transactions"],
        summary="Replace a transaction",
        description=(
            "Full update: send every writable field. `client_id` can't be changed after creation and is ignored. "
            "An omitted `currency` keeps the stored one."
        ),
        responses={200: TransactionSerializer, 400: _TRANSACTION_VALIDATION},
    ),
    partial_update=extend_schema(
        tags=["Transactions"],
        summary="Update a transaction",
        description=(
            "Changes any subset of fields. The type/category rule is checked against the resulting "
            "transaction, so changing both at once works. `client_id` is ignored.\n\n"
            "The exchange rate is looked up again only when `currency` or `date` changes (or send "
            "`exchange_rate`); changing just the amount keeps the stored rate."
        ),
        responses={200: TransactionSerializer, 400: _TRANSACTION_VALIDATION},
        examples=[OpenApiExample("Fix the amount", request_only=True, value={"amount": "49.90"})],
    ),
    destroy=extend_schema(
        tags=["Transactions"],
        summary="Delete a transaction",
        responses={204: OpenApiResponse(description="Deleted.")},
    ),
)

# --- CSV import ------------------------------------------------------------------------------


class CsvImportSerializer(serializers.Serializer):
    file = serializers.FileField(help_text="The `.csv` file (max 2 MB, 5000 data rows).")


class ImportRowResultSerializer(serializers.Serializer):
    row = serializers.IntegerField(help_text="Line number in the file; the header is line 1.")
    status = serializers.ChoiceField(
        choices=IMPORT_ROW_STATUS_CHOICES,
        help_text="`skipped`: duplicate, not an error. `failed`: the row couldn't be imported (see `reason`).",
    )
    reason = serializers.CharField(help_text="Human-readable explanation, safe to show.")


class CsvImportResultSerializer(serializers.Serializer):
    imported = serializers.IntegerField(help_text="Transactions created.")
    skipped = serializers.IntegerField(help_text="Rows ignored as duplicates.")
    failed = serializers.IntegerField(help_text="Rows that couldn't be imported.")
    details = ImportRowResultSerializer(
        many=True, help_text="One entry per skipped or failed row, in file order. Imported rows aren't listed."
    )


CSV_IMPORT_SCHEMA = extend_schema(
    tags=["CSV Import"],
    summary="Import transactions from CSV",
    description="""Creates transactions from a bank-export style CSV file (`multipart/form-data`, field `file`).

**Format** — a header row with (at least) these columns, in any order and letter case; other columns are ignored:

```csv
date,description,amount
2026-09-03,Tesco groceries,-23.40
03/09/2026,Salary,"2,500.00"
```

| Column | Rules |
|---|---|
| `date` | `YYYY-MM-DD` or `DD/MM/YYYY` |
| `amount` | Signed decimal with a **dot** as decimal separator, in the user's **base currency**. Negative = expense, positive = income, zero is rejected; whole numbers for HUF and JPY. Thousands separators (`,` and spaces) and `€ $ £` are removed. |
| `description` | Free text, max 255 characters. Also used to pick the category. |

**Category detection:** keyword rules on the description map each row to one of the user's categories
(e.g. *Tesco* → Food, *Salary* → Salary). Unmatched expenses go to **Other**; unmatched income rows fail.

**Duplicates:** a row with the same date, amount and description (ignoring case) as an existing
transaction — or an earlier row of the same file — is `skipped`.

**Outcome:** row problems don't stop the import: every valid row is saved and every other row is
reported in `details` (status `200` even if some rows failed). Problems with the file itself (not CSV,
missing columns, too many rows, empty, binary, unreadable encoding) reject the whole upload with `400`
and nothing is saved. UTF-8 (with or without BOM) and Latin-1 are accepted.

Imported expenses re-check the affected months' budgets (push notifications as usual).""",
    request={"multipart/form-data": CsvImportSerializer},
    responses={
        200: OpenApiResponse(
            CsvImportResultSerializer,
            description="Import finished (possibly with skipped or failed rows).",
            examples=[
                OpenApiExample(
                    "Mixed result",
                    value={
                        "imported": 2,
                        "skipped": 1,
                        "failed": 2,
                        "details": [
                            {"row": 4, "status": "failed", "reason": "Could not detect a category for 'Mystery income'."},
                            {"row": 5, "status": "failed", "reason": "Unrecognized amount 'abc'."},
                            {"row": 6, "status": "skipped", "reason": "Duplicate of an existing transaction."},
                        ],
                    },
                )
            ],
        ),
        400: validation_error(
            ("No file", {"file": ["This field is required."]}),
            ("Not a .csv file", {"file": ["Please upload a .csv file."]}),
            ("Missing columns", {"file": ["Missing required column(s): amount, date, description."]}),
            ("Too many rows", {"file": ["Too many rows — at most 5000 per import."]}),
            ("Empty file", {"file": ["The uploaded file is empty."]}),
            ("Binary file", {"file": ["This doesn't look like a CSV file (it contains binary data)."]}),
            description="The file as a whole was rejected; nothing was imported.",
        ),
        413: upload_too_large("file", 2),
    },
)

# --- Recurring transactions --------------------------------------------------------------------

_RECURRING_EXAMPLE = {
    "id": 13,
    "name": "Gym membership",
    "category": 206,
    "type": "expense",
    "amount": "45.90",
    "frequency": "monthly",
    "start_date": "2026-10-01",
    "end_date": None,
    "next_occurrence_date": "2026-10-01",
    "is_active": True,
    "description": "",
    "created_at": "2026-09-26T09:50:00.589170Z",
    "updated_at": "2026-09-26T09:50:00.589195Z",
}

_RECURRING_VALIDATION = validation_error(
    ("End before start", {"end_date": ["End date must be on or after the start date."]}),
    ("Type differs from category", {"type": ["Recurring transaction type must match the selected category's type."]}),
    ("Unknown frequency", {"frequency": ['"daily" is not a valid choice.']}),
    ("Missing fields", {"name": ["This field is required."], "start_date": ["This field is required."]}),
)

_RECURRING_ROLE = (
    "A recurring transaction is a **template** for a repeating payment or income (rent, salary, "
    "subscriptions). It currently powers the upcoming-payment push reminders and the *recurring share* "
    "insight; it does **not** create transactions automatically yet — record each actual payment as a "
    "normal transaction."
)

RECURRING_VIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=["Recurring Transactions"],
        summary="List recurring transactions",
        description=f"{_RECURRING_ROLE}\n\nNot paginated; sorted by `next_occurrence_date`.",
        responses={200: RecurringTransactionSerializer(many=True)},
    ),
    create=extend_schema(
        tags=["Recurring Transactions"],
        summary="Create a recurring transaction",
        description=f"{_RECURRING_ROLE}\n\n`next_occurrence_date` starts at `start_date`.",
        responses={201: RecurringTransactionSerializer, 400: _RECURRING_VALIDATION},
        examples=[
            OpenApiExample(
                "Monthly gym membership",
                request_only=True,
                value={
                    "name": "Gym membership",
                    "category": 206,
                    "type": "expense",
                    "amount": "45.90",
                    "frequency": "monthly",
                    "start_date": "2026-10-01",
                },
            ),
            OpenApiExample("Created", response_only=True, status_codes=["201"], value=_RECURRING_EXAMPLE),
        ],
    ),
    retrieve=extend_schema(
        tags=["Recurring Transactions"],
        summary="Get a recurring transaction",
        responses={200: RecurringTransactionSerializer},
    ),
    partial_update=extend_schema(
        tags=["Recurring Transactions"],
        summary="Update a recurring transaction",
        description=(
            "Changes any subset of fields. Changing `start_date` resets `next_occurrence_date` to it. "
            "Set `is_active` to `false` to pause reminders without deleting the template."
        ),
        responses={200: RecurringTransactionSerializer, 400: _RECURRING_VALIDATION},
        examples=[OpenApiExample("Pause", request_only=True, value={"is_active": False})],
    ),
    destroy=extend_schema(
        tags=["Recurring Transactions"],
        summary="Delete a recurring transaction",
        description="Transactions recorded earlier are kept.",
        responses={204: OpenApiResponse(description="Deleted.")},
    ),
)
