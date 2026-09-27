"""OpenAPI documentation for the analytics and financial-insight endpoints.

The views return plain dicts (see formatters.py); the serializers below describe
those shapes for the schema only. tests/test_openapi.py validates real responses
against them, so the two can't drift apart.
"""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import serializers

from apps.common.openapi import validation_error
from apps.currencies.models import Currency

from .insights import InsightType, Severity
from .models import AchievementCategory, AchievementUnit
from .serializers import (
    AchievementSerializer,
    MarkSeenResultSerializer,
    ComparisonQuerySerializer,
    MerchantsQuerySerializer,
    MonthQuerySerializer,
    TrendsQuerySerializer,
    YearQuerySerializer,
)
from .services import Against, BudgetStatus

INSIGHT_TYPE_CHOICES = [(item.value, item.value) for item in InsightType]
INSIGHT_SEVERITY_CHOICES = [(item.value, item.value) for item in Severity]
COMPARISON_AGAINST_CHOICES = Against.CHOICES
BUDGET_STATUS_CHOICES = BudgetStatus.CHOICES


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
    variance_percentage = serializers.FloatField(
        help_text="Budget variance: how far spending is above (+) or below (−) the limit, in % of the limit."
    )
    expected_to_date = _money(
        "What the budget allows by today when spread evenly over the month: the full limit for a past month, "
        "0 for a future one."
    )
    status = serializers.ChoiceField(
        choices=BUDGET_STATUS_CHOICES,
        help_text="`over_budget`: above the limit. `ahead_of_pace`: above `expected_to_date` but not the limit yet. "
        "`on_track`: otherwise.",
    )


class DashboardSubscriptionsSerializer(serializers.Serializer):
    active_count = serializers.IntegerField(help_text="Subscriptions active at some point during the month.")
    monthly_total = _money("What they cost per month (weekly × 52 / 12, yearly / 12).")
    yearly_total = _money("What they cost per year: the yearly projection.")
    due_this_month = _money(
        "The payments scheduled within this month (a yearly plan only counts in its billing month)."
    )
    unconverted_currencies = serializers.ListField(
        child=serializers.ChoiceField(choices=Currency.choices),
        help_text="Currencies without a recent ECB rate; subscriptions billed in them are left out.",
    )


class DashboardSerializer(MonthSummarySerializer):
    top_spending_category = TopCategorySerializer(
        allow_null=True, help_text="The expense category with the highest total; `null` without expenses."
    )
    budget_usage = BudgetUsageSerializer(many=True, help_text="Every budget of the month.")
    subscriptions = DashboardSubscriptionsSerializer(
        help_text="The month's subscriptions (see `/api/subscriptions/`), in the base currency."
    )


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


class CategoryComparisonSerializer(serializers.Serializer):
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    current_amount = _money("Spent in the selected month.")
    previous_amount = _money("Spent in the month compared against.")
    change_amount = _money("`current_amount - previous_amount`.")
    change_percentage = serializers.FloatField(allow_null=True, help_text="`null` when nothing was spent before.")


class ComparisonSerializer(serializers.Serializer):
    against = serializers.ChoiceField(choices=COMPARISON_AGAINST_CHOICES, help_text="What the month is compared with.")
    current_month = MonthSummarySerializer()
    previous_month = MonthSummarySerializer(
        help_text="The month compared against: the previous month, or the same month a year earlier."
    )
    difference = ComparisonValuesSerializer(help_text="Absolute change, current minus previous.")
    percentage_difference = ComparisonPercentagesSerializer(
        help_text="Change relative to the month compared against; `null` where its value was 0."
    )
    categories = CategoryComparisonSerializer(
        many=True, help_text="Expense categories with spending in either month, largest current spending first."
    )


class TrendMonthSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField(help_text="1–12.")
    month_name = serializers.CharField(help_text="English month name.")
    income = _money("Income that month.")
    expenses = _money("Expenses that month.")
    balance = _money("`income - expenses`.")
    expenses_change_percentage = serializers.FloatField(
        allow_null=True, help_text="Expenses against the month before; `null` when that month had none."
    )


class CategoryTrendSerializer(serializers.Serializer):
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    amounts = serializers.ListField(
        child=_money("Spent that month."), help_text="One amount per month of `months`, in the same order."
    )
    total = _money("Spent over the whole window.")
    average = _money("`total / number of months`.")
    change_amount = _money("The latest month minus the month before it.")
    change_percentage = serializers.FloatField(
        allow_null=True, help_text="The latest month against the month before it; `null` without spending before."
    )


class TrendsSerializer(serializers.Serializer):
    year = serializers.IntegerField(help_text="Last month of the window.")
    month = serializers.IntegerField()
    months = TrendMonthSerializer(many=True, help_text="Oldest first; months without transactions are zero.")
    average_monthly_expenses = _money("Average expenses per month of the window.")
    categories = CategoryTrendSerializer(
        many=True, help_text="Expense categories with spending in the window, largest first."
    )


class MerchantSerializer(serializers.Serializer):
    merchant = serializers.CharField(help_text="The most frequent spelling of the description.")
    transaction_count = serializers.IntegerField()
    total = _money("Spent at this merchant this month.")
    average = _money("Average per transaction.")
    share_percentage = serializers.FloatField(allow_null=True, help_text="Share of the month's total expenses, 0–100.")
    previous_total = _money("Spent at this merchant the month before.")
    change_percentage = serializers.FloatField(
        allow_null=True, help_text="Against the month before; `null` when nothing was spent there then."
    )
    last_date = serializers.DateField(help_text="Most recent transaction this month.")


class MerchantsSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    total_expenses = _money("All expenses of the month, including those without a merchant.")
    merchants = MerchantSerializer(many=True, help_text="Largest total first, at most `limit`.")


class WeekdaySpendingSerializer(serializers.Serializer):
    weekday = serializers.IntegerField(help_text="ISO weekday: 1 = Monday … 7 = Sunday.")
    name = serializers.CharField(help_text="English weekday name.")
    total = _money("Spent on this weekday.")
    transaction_count = serializers.IntegerField()
    days = serializers.IntegerField(help_text="How many times this weekday occurred in the counted days.")
    average_per_day = _money("`total / days`; `null` if the weekday hasn't occurred yet.", allow_null=True)


class SpendingPatternsSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    days_counted = serializers.IntegerField(
        help_text="Days of the month included: all of a past month, 1st to today for the current month, "
        "0 for a future one."
    )
    total_expenses = _money("Expenses of the counted days.")
    average_daily_spending = _money("`total_expenses / days_counted`; `null` with no days counted.", allow_null=True)
    weekdays = WeekdaySpendingSerializer(many=True, help_text="Always 7 entries, Monday first.")
    fixed_expenses = _money("Expenses a recurring template accounts for (see the description).")
    variable_expenses = _money("`total_expenses - fixed_expenses`.")
    fixed_percentage = serializers.FloatField(allow_null=True, help_text="Share of fixed expenses; `null` without expenses.")
    recurring_commitments = _money(
        "What the active recurring expense templates add up to per month (weekly × 52 / 12, yearly / 12)."
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
        "number of transactions, the top spending category, the usage of every budget, with its variance "
        "(budget vs actual, and whether spending keeps pace with the month), and what the month's "
        "subscriptions cost (converted at the rate of the month's last day, today's for the current month). "
        f"{_MONTH_NOTE}"
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
                                "variance_percentage": -23.5,
                                "expected_to_date": "40.00",
                                "status": "ahead_of_pace",
                            },
                            {
                                "budget_id": 22,
                                "category_id": None,
                                "category_name": "Overall",
                                "budget_amount": "1500.00",
                                "spent_amount": "845.90",
                                "remaining_amount": "654.10",
                                "usage_percentage": 56.39,
                                "variance_percentage": -43.61,
                                "expected_to_date": "1000.00",
                                "status": "on_track",
                            },
                        ],
                        "subscriptions": {
                            "active_count": 5,
                            "monthly_total": "95.96",
                            "yearly_total": "1151.52",
                            "due_this_month": "95.96",
                            "unconverted_currencies": [],
                        },
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
    summary="Compare a month with the previous month or year",
    description=(
        "Totals of the month and of the month it is compared with, with absolute and relative differences, "
        "plus the same comparison for every expense category.\n\n"
        "- `against=previous_month` (default): month-over-month, e.g. September vs August.\n"
        "- `against=previous_year`: year-over-year, e.g. September 2026 vs September 2025.\n\n"
        f"The compared month is always under `previous_month`. {_MONTH_NOTE}"
    ),
    parameters=[ComparisonQuerySerializer],
    responses={
        200: ComparisonSerializer,
        400: validation_error(
            ("Unknown comparison", {"against": ['"week" is not a valid choice.']}),
            ("Bad month", {"month": ["Ensure this value is less than or equal to 12."]}),
            description="A query parameter is invalid.",
        ),
    },
)

TRENDS_SCHEMA = extend_schema(
    tags=["Analytics"],
    summary="Monthly and category spending trends",
    description=(
        "Income, expenses and balance for each of the last `months` months (ending with `year`/`month`, across "
        "year boundaries), each month's change in expenses, and every expense category's spending per month "
        f"with its latest change (e.g. Food: August 280.00, September 320.00, +14.29 %). {_MONTH_NOTE} "
        "All amounts are in the user's base currency."
    ),
    parameters=[TrendsQuerySerializer],
    responses={
        200: OpenApiResponse(
            TrendsSerializer,
            description="The trends.",
            examples=[
                OpenApiExample(
                    "Two months",
                    value={
                        "year": 2026,
                        "month": 9,
                        "months": [
                            {
                                "year": 2026,
                                "month": 8,
                                "month_name": "August",
                                "income": "3000.00",
                                "expenses": "1920.00",
                                "balance": "1080.00",
                                "expenses_change_percentage": 3.78,
                            },
                            {
                                "year": 2026,
                                "month": 9,
                                "month_name": "September",
                                "income": "3000.00",
                                "expenses": "2100.00",
                                "balance": "900.00",
                                "expenses_change_percentage": 9.38,
                            },
                        ],
                        "average_monthly_expenses": "2010.00",
                        "categories": [
                            {
                                "category_id": 2,
                                "category_name": "Food",
                                "amounts": ["280.00", "320.00"],
                                "total": "600.00",
                                "average": "300.00",
                                "change_amount": "40.00",
                                "change_percentage": 14.29,
                            }
                        ],
                    },
                )
            ],
        ),
        400: validation_error(
            ("Out of range", {"months": ["Ensure this value is less than or equal to 24."]}),
            ("Bad month", {"month": ["Ensure this value is less than or equal to 12."]}),
            description="A query parameter is invalid.",
        ),
    },
)

MERCHANTS_SCHEMA = extend_schema(
    tags=["Analytics"],
    summary="Top merchants",
    description=(
        "The month's expenses grouped by merchant, largest first. The merchant is the transaction's description, "
        "compared without letter case and surrounding spaces; expenses without a description belong to no "
        f"merchant but count in `total_expenses`. Each merchant is compared with the month before. {_MONTH_NOTE}"
    ),
    parameters=[MerchantsQuerySerializer],
    responses={
        200: OpenApiResponse(
            MerchantsSerializer,
            description="The top merchants.",
            examples=[
                OpenApiExample(
                    "September",
                    value={
                        "year": 2026,
                        "month": 9,
                        "total_expenses": "1950.00",
                        "merchants": [
                            {
                                "merchant": "Albert Heijn",
                                "transaction_count": 6,
                                "total": "420.00",
                                "average": "70.00",
                                "share_percentage": 21.54,
                                "previous_total": "380.00",
                                "change_percentage": 10.53,
                                "last_date": "2026-09-24",
                            },
                            {
                                "merchant": "Shell",
                                "transaction_count": 3,
                                "total": "180.00",
                                "average": "60.00",
                                "share_percentage": 9.23,
                                "previous_total": "0.00",
                                "change_percentage": None,
                                "last_date": "2026-09-20",
                            },
                        ],
                    },
                )
            ],
        ),
        400: validation_error(
            ("Too many", {"limit": ["Ensure this value is less than or equal to 50."]}),
            description="A query parameter is invalid.",
        ),
    },
)

SPENDING_PATTERNS_SCHEMA = extend_schema(
    tags=["Analytics"],
    summary="Daily, weekday and fixed-vs-variable spending",
    description=(
        "How the month's spending is spread: the average per day, the total and daily average for each weekday, "
        "and fixed vs variable expenses. For the current month everything is month-to-date.\n\n"
        "**Fixed** expenses are the ones a recurring template accounts for: linked to a template, or in the same "
        "category with exactly the template's amount while the template runs (a 600.00 rent, a 12.99 "
        f"subscription). Everything else is **variable**. {_MONTH_NOTE}"
    ),
    parameters=[MonthQuerySerializer],
    responses={200: SpendingPatternsSerializer, 400: _QUERY_ERRORS},
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

# --- Achievements -----------------------------------------------------------------------------

ACHIEVEMENT_CATEGORY_CHOICES = AchievementCategory.choices  # module-level for ENUM_NAME_OVERRIDES
ACHIEVEMENT_UNIT_CHOICES = AchievementUnit.choices

_ACHIEVEMENT_EXAMPLES = [
    {
        "code": "streak_7",
        "name": "7 Day Tracking Streak",
        "title": "7 Day Tracking Streak",
        "detail": None,
        "description": "Record transactions on 7 days in a row.",
        "icon": "🔥",
        "category": "tracking",
        "unit": "days",
        "target": "7.00",
        "target_currency": None,
        "progress": "7.00",
        "progress_percentage": 100.0,
        "unlocked": True,
        "unlocked_at": "2026-09-27T08:12:40.118273Z",
        "is_new": True,
    },
    {
        "code": "saved_1000",
        "name": "€1,000 Saved",
        "title": "€1,000 Saved",
        "detail": None,
        "description": "Have €1,000 in your savings goals.",
        "icon": "🏆",
        "category": "saving",
        "unit": "money",
        "target": "1000.00",
        "target_currency": "EUR",
        "progress": "412.50",
        "progress_percentage": 41.25,
        "unlocked": False,
        "unlocked_at": None,
        "is_new": False,
    },
    {
        "code": "stayed_under_budget",
        "name": "Stayed Under Budget",
        "title": "Stayed Under Food Budget",
        "detail": "August 2026",
        "description": "Finish a month without going over a budget.",
        "icon": "🎯",
        "category": "budgeting",
        "unit": "count",
        "target": "1.00",
        "target_currency": None,
        "progress": "1.00",
        "progress_percentage": 100.0,
        "unlocked": True,
        "unlocked_at": "2026-09-01T06:02:11.500120Z",
        "is_new": False,
    },
]

ACHIEVEMENTS_LIST_SCHEMA = extend_schema(
    tags=["Achievements"],
    summary="List achievements",
    description=(
        "Every achievement of the catalog with the user's progress, in catalog order. Evaluated on the server "
        "when requested: milestones reached since the last call are unlocked (and stored) now, and stay "
        "unlocked for good — a streak that breaks later doesn't take one back.\n\n"
        "- **Tracking streaks** count the days a transaction was *recorded* on (UTC), consecutive up to today "
        "or yesterday.\n"
        "- **Saved** amounts are the savings-goal total of the Savings page (goals that aren't archived), "
        "converted into `target_currency` at the latest ECB rate; without a rate the progress isn't updated.\n"
        "- **Stayed under budget** needs a finished month with tracked expenses that didn't go over one of its "
        "budgets.\n\n"
        "Not paginated."
    ),
    responses={
        200: OpenApiResponse(
            AchievementSerializer(many=True),
            description="The catalog with progress.",
            examples=[OpenApiExample("Some progress", value=_ACHIEVEMENT_EXAMPLES)],
        )
    },
)

MARK_SEEN_SCHEMA = extend_schema(
    tags=["Achievements"],
    summary="Mark achievements as seen",
    description="Clears `is_new` on every unlocked achievement — call it once the user has seen them.",
    request=None,
    responses={200: MarkSeenResultSerializer},
)
