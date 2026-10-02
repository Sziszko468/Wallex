"""OpenAPI documentation for subscriptions."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view

from apps.common.openapi import validation_error

from .serializers import SubscriptionSerializer, SubscriptionSummarySerializer
from .services import Status

SUBSCRIPTION_STATUS_CHOICES = Status.CHOICES  # module-level for ENUM_NAME_OVERRIDES

_ROLE = (
    "A subscription (streaming, music, software, gym, internet, phone, insurance, …) is a **recurring "
    "expense**: the same row as in `/api/recurring-transactions/` (there with `is_subscription: true`), "
    "so payment reminders and the recurring-share insight include it. Its payments are recorded as normal "
    "transactions; nothing is generated automatically yet.\n\n"
    "**Costs:** `amount` is billed in `currency` and never converted. `monthly_cost` / `yearly_cost` are "
    "in that currency; `base_monthly_cost` / `base_yearly_cost` in the user's base currency at the latest "
    "ECB rate (`null` without a rate of the last 7 days). Weekly = 52 payments a year."
)

_EXAMPLE = {
    "id": 42,
    "name": "Netflix",
    "merchant": "Netflix International B.V.",
    "amount": "15.49",
    "currency": "USD",
    "category": 205,
    "frequency": "monthly",
    "start_date": "2025-03-05",
    "end_date": None,
    "next_payment_date": "2026-10-05",
    "active": True,
    "status": "active",
    "upcoming_payments": ["2026-10-05", "2026-11-05", "2026-12-05"],
    "monthly_cost": "15.49",
    "yearly_cost": "185.88",
    "base_monthly_cost": "13.24",
    "base_yearly_cost": "158.87",
    "description": "Standard plan",
    "created_at": "2026-09-27T09:12:44.102318Z",
    "updated_at": "2026-09-27T09:12:44.102340Z",
}

_VALIDATION = validation_error(
    ("Income category", {"category": ["Subscriptions are expenses: choose an expense category."]}),
    ("Unknown or foreign category", {"category": ['Invalid pk "999999" - object does not exist.']}),
    ("End before start", {"end_date": ["End date must be on or after the start date."]}),
    ("Amount too small", {"amount": ["Ensure this value is greater than or equal to 0.01."]}),
    ("Fractional forints", {"amount": ["HUF amounts can't have decimals."]}),
    ("Unknown frequency", {"frequency": ['"daily" is not a valid choice.']}),
    ("Unknown currency", {"currency": ['"XYZ" is not a valid choice.']}),
    ("Missing fields", {"name": ["This field is required."], "amount": ["This field is required."]}),
)

SUBSCRIPTION_VIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=["Subscriptions"],
        summary="List subscriptions",
        description=f"{_ROLE}\n\nNot paginated. Active ones first, then paused, then ended; by name within each.",
        responses={200: SubscriptionSerializer(many=True)},
    ),
    create=extend_schema(
        tags=["Subscriptions"],
        summary="Create a subscription",
        description=(
            f"{_ROLE}\n\nRequired: `name`, `amount`, `category` (an expense category), `frequency`, `start_date`. "
            "`next_payment_date`, the costs and `status` are computed."
        ),
        responses={201: SubscriptionSerializer, 400: _VALIDATION},
        examples=[
            OpenApiExample(
                "Monthly, in the base currency",
                request_only=True,
                value={
                    "name": "Spotify",
                    "amount": "10.99",
                    "category": 205,
                    "frequency": "monthly",
                    "start_date": "2026-01-14",
                },
            ),
            OpenApiExample(
                "Billed in another currency",
                request_only=True,
                value={
                    "name": "Netflix",
                    "merchant": "Netflix International B.V.",
                    "amount": "15.49",
                    "currency": "USD",
                    "category": 205,
                    "frequency": "monthly",
                    "start_date": "2025-03-05",
                    "description": "Standard plan",
                },
            ),
            OpenApiExample("Created", response_only=True, status_codes=["201"], value=_EXAMPLE),
        ],
    ),
    retrieve=extend_schema(
        tags=["Subscriptions"], summary="Get a subscription", responses={200: SubscriptionSerializer}
    ),
    partial_update=extend_schema(
        tags=["Subscriptions"],
        summary="Update a subscription",
        description=(
            "Changes any subset of fields; the rules are checked against the resulting subscription. "
            "Send `active: false` to pause it (no payments ahead, left out of the totals) and `end_date` "
            "to record a cancellation."
        ),
        responses={200: SubscriptionSerializer, 400: _VALIDATION},
        examples=[
            OpenApiExample("Price increase", request_only=True, value={"amount": "17.99"}),
            OpenApiExample("Pause", request_only=True, value={"active": False}),
            OpenApiExample("Cancelled", request_only=True, value={"end_date": "2026-12-05"}),
        ],
    ),
    destroy=extend_schema(
        tags=["Subscriptions"],
        summary="Delete a subscription",
        description="Transactions recorded for it earlier are kept. To keep its history, set an `end_date` instead.",
        responses={204: OpenApiResponse(description="Deleted.")},
    ),
)

SUMMARY_SCHEMA = extend_schema(
    tags=["Subscriptions"],
    summary="Subscription totals",
    description=(
        "The user's subscriptions today: how many are active, paused or ended, what the active ones cost per "
        "month and per year in the base currency (sums of each subscription's `base_monthly_cost` / "
        "`base_yearly_cost`), the same per category, and every payment due in the next 30 days."
    ),
    responses={
        200: OpenApiResponse(
            SubscriptionSummarySerializer,
            description="Totals and upcoming payments.",
            examples=[
                OpenApiExample(
                    "Five subscriptions",
                    value={
                        "currency": "EUR",
                        "active_count": 5,
                        "paused_count": 1,
                        "ended_count": 0,
                        "monthly_total": "95.96",
                        "yearly_total": "1151.52",
                        "by_category": [
                            {
                                "category_id": 208,
                                "category_name": "Bills",
                                "monthly_total": "54.98",
                                "subscription_count": 2,
                                "percentage": 57.29,
                            },
                            {
                                "category_id": 205,
                                "category_name": "Entertainment",
                                "monthly_total": "40.98",
                                "subscription_count": 3,
                                "percentage": 42.71,
                            },
                        ],
                        "upcoming": [
                            {
                                "subscription_id": 42,
                                "name": "Netflix",
                                "date": "2026-10-05",
                                "amount": "15.49",
                                "currency": "USD",
                                "base_amount": "13.24",
                            }
                        ],
                        "unconverted_currencies": [],
                    },
                )
            ],
        )
    },
)
