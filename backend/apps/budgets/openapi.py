"""OpenAPI documentation for the budget endpoints."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view

from apps.common.openapi import validation_error

from .models import SavingsGoalStatus
from .serializers import BudgetSerializer, MoneyMovementSerializer, SavingsGoalSerializer, SavingsSummarySerializer

_VALIDATION = validation_error(
    ("Duplicate", {"non_field_errors": ["A budget for this category and month already exists."]}),
    ("Income category", {"category": ["Budgets can only be set for expense categories."]}),
    ("Out of range", {
        "amount": ["Ensure this value is greater than or equal to 0.01."],
        "year": ["Ensure this value is greater than or equal to 2000."],
        "month": ["Ensure this value is less than or equal to 12."],
    }),
)

_EXAMPLE = {
    "id": 21,
    "category": 206,
    "amount": "60.00",
    "year": 2026,
    "month": 9,
    "spent_amount": "45.90",
    "remaining_amount": "14.10",
    "usage_percentage": 76.5,
    "created_at": "2026-09-26T09:49:59.164661Z",
    "updated_at": "2026-09-26T09:49:59.164690Z",
}

_ABOUT = (
    "A budget caps the **expenses** of one calendar month — either for one expense category, or, with "
    "`category: null`, for all expenses together (the *overall* budget). There is at most one budget per "
    "category (or overall) per month. `spent_amount`, `remaining_amount` and `usage_percentage` are "
    "computed live from the month's expense transactions."
)

BUDGET_VIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=["Budgets"],
        summary="List budgets",
        description=f"{_ABOUT}\n\nAll months, newest first. Not paginated.",
        responses={200: BudgetSerializer(many=True)},
    ),
    create=extend_schema(
        tags=["Budgets"],
        summary="Create a budget",
        description=(
            f"{_ABOUT}\n\nIf the month's spending already exceeds 80 % / 100 % of the new budget, a push "
            "notification is sent."
        ),
        responses={201: OpenApiResponse(BudgetSerializer, description="Created."), 400: _VALIDATION},
        examples=[
            OpenApiExample(
                "Category budget", request_only=True, value={"category": 206, "amount": "60.00", "year": 2026, "month": 9}
            ),
            OpenApiExample(
                "Overall budget", request_only=True, value={"category": None, "amount": "1500.00", "year": 2026, "month": 9}
            ),
            OpenApiExample("Created", response_only=True, status_codes=["201"], value=_EXAMPLE),
        ],
    ),
    retrieve=extend_schema(tags=["Budgets"], summary="Get a budget", responses={200: BudgetSerializer}),
    partial_update=extend_schema(
        tags=["Budgets"],
        summary="Update a budget",
        description=(
            "Changes any subset of fields. A change that puts usage past 80 % or 100 % sends the budget "
            "push notification (once per budget and threshold)."
        ),
        responses={200: BudgetSerializer, 400: _VALIDATION},
        examples=[OpenApiExample("Raise the limit", request_only=True, value={"amount": "80.00"})],
    ),
    destroy=extend_schema(
        tags=["Budgets"],
        summary="Delete a budget",
        description="Transactions are not affected.",
        responses={204: OpenApiResponse(description="Deleted.")},
    ),
)

# --- Savings goals ---------------------------------------------------------------------------

SAVINGS_GOAL_STATUS_CHOICES = SavingsGoalStatus.choices  # module-level for ENUM_NAME_OVERRIDES

_GOALS = "Savings Goals"

_GOAL_ABOUT = (
    "A savings goal is money put aside for something — a trip, a laptop, an emergency fund. "
    "`target_amount` and `current_amount` are in the goal's own `currency` (the currency the money is "
    "saved in) and are never converted; `base_current_amount` / `base_target_amount` show them in the "
    "user's base currency at the latest ECB rate. Goals don't create transactions and don't count as "
    "expenses: putting money aside isn't spending it.\n\n"
    "`status` follows the amounts: `completed` once `current_amount` reaches `target_amount`, back to "
    "`active` if it drops below. Only `archived` is the user's choice."
)

_GOAL_EXAMPLE = {
    "id": 7,
    "name": "Japan trip",
    "currency": "EUR",
    "target_amount": "3000.00",
    "current_amount": "1850.00",
    "target_date": "2027-04-01",
    "status": "active",
    "progress_percentage": 61.67,
    "remaining_amount": "1150.00",
    "days_left": 186,
    "monthly_needed": "191.67",
    "base_current_amount": "1850.00",
    "base_target_amount": "3000.00",
    "created_at": "2026-09-27T10:15:02.118273Z",
    "updated_at": "2026-09-27T10:15:02.118296Z",
}

_GOAL_VALIDATION = validation_error(
    ("Target too small", {"target_amount": ["Ensure this value is greater than or equal to 0.01."]}),
    ("Negative saved amount", {"current_amount": ["Ensure this value is greater than or equal to 0.00."]}),
    ("Fractional forints", {"target_amount": ["HUF amounts can't have decimals."]}),
    ("Past target date", {"target_date": ["The target date can't be in the past."]}),
    ("Currency with savings", {"currency": ["The currency can't change once money is saved in the goal."]}),
    ("Completed sent", {"status": ["A goal is completed automatically when the saved amount reaches the target."]}),
    ("Unknown currency", {"currency": ['"XYZ" is not a valid choice.']}),
    ("Missing fields", {"name": ["This field is required."], "target_amount": ["This field is required."]}),
)

_MONEY_VALIDATION = validation_error(
    ("Too small", {"amount": ["Ensure this value is greater than or equal to 0.01."]}),
    ("Fractional forints", {"amount": ["HUF amounts can't have decimals."]}),
    ("More than saved", {"amount": ["You can't remove more than the 150.00 EUR saved."]}),
    ("Archived goal", {"non_field_errors": ["This goal is archived. Restore it to add or remove money."]}),
    ("Missing amount", {"amount": ["This field is required."]}),
)

SAVINGS_GOAL_VIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=[_GOALS],
        summary="List savings goals",
        description=(
            f"{_GOAL_ABOUT}\n\nNot paginated. Active goals first, then completed, then archived; the nearest "
            "`target_date` first within each (goals without one last)."
        ),
        responses={200: SavingsGoalSerializer(many=True)},
    ),
    create=extend_schema(
        tags=[_GOALS],
        summary="Create a savings goal",
        description=f"{_GOAL_ABOUT}\n\nRequired: `name` and `target_amount`.",
        responses={201: OpenApiResponse(SavingsGoalSerializer, description="Created."), 400: _GOAL_VALIDATION},
        examples=[
            OpenApiExample(
                "Japan trip",
                request_only=True,
                value={
                    "name": "Japan trip",
                    "target_amount": "3000.00",
                    "current_amount": "1850.00",
                    "target_date": "2027-04-01",
                },
            ),
            OpenApiExample(
                "In another currency",
                request_only=True,
                value={"name": "New laptop", "currency": "HUF", "target_amount": "650000"},
            ),
            OpenApiExample("Created", response_only=True, status_codes=["201"], value=_GOAL_EXAMPLE),
        ],
    ),
    retrieve=extend_schema(tags=[_GOALS], summary="Get a savings goal", responses={200: SavingsGoalSerializer}),
    partial_update=extend_schema(
        tags=[_GOALS],
        summary="Update a savings goal",
        description=(
            "Changes any subset of fields; `status` follows the resulting amounts. Send `status: archived` to "
            "archive the goal and `status: active` to restore it. To add or remove money, prefer the `deposit` "
            "and `withdraw` actions: they stay correct when two devices save at the same time."
        ),
        responses={200: SavingsGoalSerializer, 400: _GOAL_VALIDATION},
        examples=[
            OpenApiExample("Raise the target", request_only=True, value={"target_amount": "3500.00"}),
            OpenApiExample("Archive", request_only=True, value={"status": "archived"}),
        ],
    ),
    destroy=extend_schema(
        tags=[_GOALS],
        summary="Delete a savings goal",
        description="Deletes the goal. Transactions are not affected.",
        responses={204: OpenApiResponse(description="Deleted.")},
    ),
)

_MOVEMENT_EXAMPLE = OpenApiExample("200 euros", request_only=True, value={"amount": "200.00"})

DEPOSIT_SCHEMA = extend_schema(
    tags=[_GOALS],
    summary="Add money to a savings goal",
    description=(
        "Adds `amount` (in the goal's currency) to `current_amount` atomically and answers with the updated "
        "goal; reaching the target makes it `completed`. Not possible for an archived goal."
    ),
    request=MoneyMovementSerializer,
    responses={200: SavingsGoalSerializer, 400: _MONEY_VALIDATION},
    examples=[_MOVEMENT_EXAMPLE],
)

WITHDRAW_SCHEMA = extend_schema(
    tags=[_GOALS],
    summary="Remove money from a savings goal",
    description=(
        "Takes `amount` (in the goal's currency) out of `current_amount` atomically and answers with the "
        "updated goal. At most what is saved; a completed goal becomes `active` again below its target. "
        "Not possible for an archived goal."
    ),
    request=MoneyMovementSerializer,
    responses={200: SavingsGoalSerializer, 400: _MONEY_VALIDATION},
    examples=[_MOVEMENT_EXAMPLE],
)

SAVINGS_SUMMARY_SCHEMA = extend_schema(
    tags=[_GOALS],
    summary="Savings progress",
    description=(
        "All goals at a glance, for the dashboard: how many are active, completed and archived, and — for "
        "the goals that aren't archived — what is saved and targeted in total, in the base currency."
    ),
    responses={
        200: OpenApiResponse(
            SavingsSummarySerializer,
            description="Totals.",
            examples=[
                OpenApiExample(
                    "Three goals",
                    value={
                        "currency": "EUR",
                        "active_count": 2,
                        "completed_count": 1,
                        "archived_count": 0,
                        "total_saved": "4350.00",
                        "total_target": "6500.00",
                        "progress_percentage": 66.92,
                        "unconverted_currencies": [],
                    },
                )
            ],
        )
    },
)
