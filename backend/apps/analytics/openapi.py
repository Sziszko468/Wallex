"""OpenAPI documentation for the analytics and financial-insight endpoints.

The views return plain dicts (see formatters.py); the serializers below describe
those shapes for the schema only. tests/test_openapi.py validates real responses
against them, so the two can't drift apart.
"""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import serializers

from apps.common.openapi import validation_error

from .insights import InsightType, Severity
from .serializers import MonthQuerySerializer, YearQuerySerializer

INSIGHT_TYPE_CHOICES = [(item.value, item.value) for item in InsightType]
INSIGHT_SEVERITY_CHOICES = [(item.value, item.value) for item in Severity]


def _money(help_text: str, **kwargs) -> serializers.DecimalField:
    return serializers.DecimalField(max_digits=14, decimal_places=2, help_text=help_text, **kwargs)


class MonthSummarySerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    total_income = _money("Sum of income transactions.")
    total_expenses = _money("Sum of expense transactions.")
    balance = _money("`total_income - total_expenses`; negative when overspent.")
    transaction_count = serializers.IntegerField()


class TopCategorySerializer(serializers.Serializer):
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    amount = _money("Spent in this category this month.")


class BudgetUsageSerializer(serializers.Serializer):
    budget_id = serializers.IntegerField()
    category_id = serializers.IntegerField(allow_null=True, help_text="`null` for the overall budget.")
    category_name = serializers.CharField(help_text='The category name, or `"Overall"`.')
    budget_amount = _money("The monthly limit.")
    spent_amount = _money("Spent so far this month.")
    remaining_amount = _money("Negative when over budget.")
    usage_percentage = serializers.FloatField(help_text="`spent / budget × 100`; above 100 when over budget.")


class DashboardSerializer(MonthSummarySerializer):
    top_spending_category = TopCategorySerializer(
        allow_null=True, help_text="The expense category with the highest total; `null` without expenses."
    )
    budget_usage = BudgetUsageSerializer(many=True, help_text="Every budget of the month.")


class MonthlyEntrySerializer(serializers.Serializer):
    month = serializers.IntegerField(help_text="1–12.")
    month_name = serializers.CharField(help_text="English month name.")
    income = _money("Income that month.")
    expenses = _money("Expenses that month.")
    balance = _money("`income - expenses`.")


class MonthlyAnalyticsSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    months = MonthlyEntrySerializer(many=True, help_text="Always 12 entries, January first; empty months are zero.")


class CategoryShareSerializer(serializers.Serializer):
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    amount = _money("Spent in this category.")
    percentage = serializers.FloatField(help_text="Share of the month's total expenses, 0–100.")


class CategoryAnalyticsSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    categories = CategoryShareSerializer(many=True, help_text="Expense categories with spending, largest first.")


class ComparisonValuesSerializer(serializers.Serializer):
    total_income = _money("Current minus previous month.")
    total_expenses = _money("Current minus previous month.")
    balance = _money("Current minus previous month.")


class ComparisonPercentagesSerializer(serializers.Serializer):
    total_income = serializers.FloatField(allow_null=True)
    total_expenses = serializers.FloatField(allow_null=True)
    balance = serializers.FloatField(allow_null=True)


class ComparisonSerializer(serializers.Serializer):
    current_month = MonthSummarySerializer()
    previous_month = MonthSummarySerializer()
    difference = ComparisonValuesSerializer(help_text="Absolute change, current minus previous.")
    percentage_difference = ComparisonPercentagesSerializer(
        help_text="Change relative to the previous month; `null` where the previous value was 0."
    )


class InsightSerializer(serializers.Serializer):
    id = serializers.CharField(
        help_text="Stable id of this observation (e.g. `budget_exceeded:21`); use it as a list key or to "
        "remember which insights the user dismissed."
    )
    type = serializers.ChoiceField(choices=INSIGHT_TYPE_CHOICES, help_text="What was observed (see the table above).")
    severity = serializers.ChoiceField(
        choices=INSIGHT_SEVERITY_CHOICES, help_text="`alert` > `warning` > `positive` > `info`; the list is sorted by it."
    )
    message = serializers.CharField(help_text="English sentence for the user. Contains no currency symbol.")
    category_id = serializers.IntegerField(allow_null=True, help_text="The category concerned, if any.")
    amount = _money("The amount the insight is about (see the table); `null` if none.", allow_null=True)
    percentage = serializers.FloatField(allow_null=True, help_text="The percentage the insight is about; `null` if none.")


class InsightListSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    insights = InsightSerializer(many=True, help_text="Most urgent first. Empty when there is nothing to say.")


_QUERY_ERRORS = validation_error(
    ("Out of range", {
        "year": ["Ensure this value is greater than or equal to 2000."],
        "month": ["Ensure this value is less than or equal to 12."],
    }),
    ("Not a number", {"year": ["A valid integer is required."]}),
    description="`year` or `month` is invalid.",
)

_MONTH_NOTE = "`year` and `month` default to the current month (UTC)."

DASHBOARD_SCHEMA = extend_schema(
    tags=["Analytics"],
    summary="Monthly dashboard",
    description=(
        "Everything a dashboard needs for one month in a single call: income, expenses, balance, "
        f"number of transactions, the top spending category and the usage of every budget. {_MONTH_NOTE}"
    ),
    parameters=[MonthQuerySerializer],
    responses={
        200: OpenApiResponse(
            DashboardSerializer,
            description="Dashboard data.",
            examples=[
                OpenApiExample(
                    "September",
                    value={
                        "year": 2026,
                        "month": 9,
                        "total_income": "2500.00",
                        "total_expenses": "845.90",
                        "balance": "1654.10",
                        "transaction_count": 14,
                        "top_spending_category": {"category_id": 1, "category_name": "Housing", "amount": "600.00"},
                        "budget_usage": [
                            {
                                "budget_id": 21,
                                "category_id": 206,
                                "category_name": "Gym",
                                "budget_amount": "60.00",
                                "spent_amount": "45.90",
                                "remaining_amount": "14.10",
                                "usage_percentage": 76.5,
                            },
                            {
                                "budget_id": 22,
                                "category_id": None,
                                "category_name": "Overall",
                                "budget_amount": "1500.00",
                                "spent_amount": "845.90",
                                "remaining_amount": "654.10",
                                "usage_percentage": 56.39,
                            },
                        ],
                    },
                )
            ],
        ),
        400: _QUERY_ERRORS,
    },
)

MONTHLY_SCHEMA = extend_schema(
    tags=["Analytics"],
    summary="Income and expenses per month of a year",
    description="Twelve monthly totals for charts. `year` defaults to the current year.",
    parameters=[YearQuerySerializer],
    responses={200: MonthlyAnalyticsSerializer, 400: _QUERY_ERRORS},
)

CATEGORIES_SCHEMA = extend_schema(
    tags=["Analytics"],
    summary="Spending by category",
    description=f"Each expense category's total and share of the month's expenses, largest first. {_MONTH_NOTE}",
    parameters=[MonthQuerySerializer],
    responses={200: CategoryAnalyticsSerializer, 400: _QUERY_ERRORS},
)

COMPARISON_SCHEMA = extend_schema(
    tags=["Analytics"],
    summary="Compare a month with the previous one",
    description=f"Totals of the month and the month before, with absolute and relative differences. {_MONTH_NOTE}",
    parameters=[MonthQuerySerializer],
    responses={200: ComparisonSerializer, 400: _QUERY_ERRORS},
)

INSIGHTS_SCHEMA = extend_schema(
    tags=["Financial Insights"],
    summary="Financial insights for a month",
    description=f"""Rule-based observations about the month, most urgent first. {_MONTH_NOTE}
For the current month, comparisons with the previous month are month-to-date on both sides
(e.g. 1–15 September vs 1–15 August).

| `type` | `severity` | When | `amount` | `percentage` |
|---|---|---|---|---|
| `budget_exceeded` | alert | A budget's spending is above its limit | Amount over the limit | Budget usage % |
| `budget_warning` | warning | A budget is at least 80 % used | Amount left | Budget usage % |
| `overspending` | alert | Expenses are higher than income | Deficit | Deficit as % of income |
| `savings` | positive | Income is higher than expenses | Amount saved | Saved % of income |
| `category_increase` | warning | A category's spending rose by ≥ 10 % **and** ≥ 10.00 vs last month (top 3) | Increase | Change % |
| `category_decrease` | positive | Same, but decreased | Decrease | Change % |
| `recurring_share` | warning if ≥ 50 %, else info | Active recurring expenses (monthly equivalent) relative to income | Monthly recurring expenses | % of income |
| `top_category` | info | The category with the highest spending | Its total | Its share of expenses % |

Rules that need income (`overspending`, `savings`, `recurring_share`) are skipped in a month without
income; category changes are skipped for categories with no spending last month.""",
    parameters=[MonthQuerySerializer],
    responses={
        200: OpenApiResponse(
            InsightListSerializer,
            description="The month's insights.",
            examples=[
                OpenApiExample(
                    "September",
                    value={
                        "year": 2026,
                        "month": 9,
                        "insights": [
                            {
                                "id": "budget_exceeded:21",
                                "type": "budget_exceeded",
                                "severity": "alert",
                                "message": "Gym exceeded its budget by 15%.",
                                "category_id": 206,
                                "amount": "9.00",
                                "percentage": 115.0,
                            },
                            {
                                "id": "savings",
                                "type": "savings",
                                "severity": "positive",
                                "message": "You saved 66% of your income this month.",
                                "category_id": None,
                                "amount": "1654.10",
                                "percentage": 66.16,
                            },
                            {
                                "id": "top_category:1",
                                "type": "top_category",
                                "severity": "info",
                                "message": "Highest spending category is Housing (71% of this month's expenses).",
                                "category_id": 1,
                                "amount": "600.00",
                                "percentage": 70.93,
                            },
                        ],
                    },
                )
            ],
        ),
        400: _QUERY_ERRORS,
    },
)
