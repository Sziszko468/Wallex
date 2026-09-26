"""OpenAPI documentation for the budget endpoints."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view

from apps.common.openapi import validation_error

from .serializers import BudgetSerializer

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
