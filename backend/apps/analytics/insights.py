"""Rule-based financial insights.

All data is fetched up front into an ``InsightContext`` (a fixed number of
queries), then every rule is a pure function ``InsightContext -> list[Insight]``.
Adding a rule therefore never adds a query, and each rule can be unit-tested
without touching the database.
"""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

from . import services

ZERO = Decimal("0.00")
HUNDRED = Decimal(100)

# A category change is only worth mentioning when it is both relatively and
# absolutely noticeable — 1.00 -> 3.00 is +200% but not an insight.
CATEGORY_CHANGE_MIN_PERCENT = Decimal(10)
CATEGORY_CHANGE_MIN_AMOUNT = Decimal("10.00")
MAX_CATEGORY_CHANGE_INSIGHTS = 3

BUDGET_WARNING_PERCENT = Decimal(80)
RECURRING_SHARE_WARNING_PERCENT = Decimal(50)


class Severity(StrEnum):
    ALERT = "alert"
    WARNING = "warning"
    POSITIVE = "positive"
    INFO = "info"


SEVERITY_ORDER = {Severity.ALERT: 0, Severity.WARNING: 1, Severity.POSITIVE: 2, Severity.INFO: 3}


class InsightType(StrEnum):
    TOP_CATEGORY = "top_category"
    CATEGORY_INCREASE = "category_increase"
    CATEGORY_DECREASE = "category_decrease"
    BUDGET_EXCEEDED = "budget_exceeded"
    BUDGET_WARNING = "budget_warning"
    RECURRING_SHARE = "recurring_share"
    OVERSPENDING = "overspending"
    SAVINGS = "savings"


@dataclass(frozen=True)
class Insight:
    id: str
    type: InsightType
    severity: Severity
    message: str
    category_id: int | None = None
    amount: Decimal | None = None
    percentage: Decimal | None = None


@dataclass(frozen=True)
class CategoryTotal:
    name: str
    total: Decimal


@dataclass(frozen=True)
class InsightContext:
    total_income: Decimal
    total_expenses: Decimal
    # Full selected month, sorted by total descending.
    category_totals: list[tuple[int, CategoryTotal]]
    # Period-aligned totals for the month-over-month comparison (see _comparison_ranges).
    comparison_current: dict[int, CategoryTotal]
    comparison_previous: dict[int, CategoryTotal]
    is_month_to_date: bool
    budget_usage: list[dict]
    recurring_monthly_expenses: Decimal


def _percent(part: Decimal, whole: Decimal) -> Decimal:
    return round(part / whole * HUNDRED, 2)


def whole_percent(value: Decimal) -> str:
    """Message-friendly percentage: 14.5 -> "15" (half-up, not banker's rounding)."""
    return str(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _totals_by_category(rows) -> dict[int, CategoryTotal]:
    return {row["category_id"]: CategoryTotal(row["category__name"], row["total"]) for row in rows}


def _comparison_ranges(year: int, month: int, today: date):
    """Date ranges for comparing the selected month with the previous one.

    When the selected month is the current month it is still in progress, so
    comparing it with the whole previous month would report almost every
    category as "decreased" early in the month. In that case both periods are
    cut at today's day of the month (clamped to the previous month's length).
    """
    prev_year, prev_month = services.previous_month(year, month)
    current_start, current_end = services.month_date_range(year, month)
    previous_start, previous_end = services.month_date_range(prev_year, prev_month)

    is_month_to_date = (year, month) == (today.year, today.month)
    if is_month_to_date:
        current_end = today
        previous_end = previous_start.replace(day=min(today.day, monthrange(prev_year, prev_month)[1]))

    return (current_start, current_end), (previous_start, previous_end), is_month_to_date


def build_context(user, year: int, month: int, today: date) -> InsightContext:
    """Fetch everything the rules need. Always exactly 6 queries."""
    summary = services.get_month_summary(user, year, month)
    category_rows = services.get_category_expense_rows(user, year, month)
    current_range, previous_range, is_month_to_date = _comparison_ranges(year, month, today)

    return InsightContext(
        total_income=summary["total_income"],
        total_expenses=summary["total_expenses"],
        category_totals=list(_totals_by_category(category_rows).items()),
        comparison_current=_totals_by_category(
            services.get_category_expense_rows_between(user, *current_range)
        ),
        comparison_previous=_totals_by_category(
            services.get_category_expense_rows_between(user, *previous_range)
        ),
        is_month_to_date=is_month_to_date,
        budget_usage=services.get_budget_usage(user, year, month),
        recurring_monthly_expenses=services.get_recurring_monthly_expenses(user, year, month, today),
    )


# --- Rules -----------------------------------------------------------------


def top_category_rule(ctx: InsightContext) -> list[Insight]:
    if not ctx.category_totals or not ctx.total_expenses:
        return []
    category_id, top = ctx.category_totals[0]
    share = _percent(top.total, ctx.total_expenses)
    return [
        Insight(
            id=f"{InsightType.TOP_CATEGORY}:{category_id}",
            type=InsightType.TOP_CATEGORY,
            severity=Severity.INFO,
            message=f"Highest spending category is {top.name} "
            f"({whole_percent(share)}% of this month's expenses).",
            category_id=category_id,
            amount=top.total,
            percentage=share,
        )
    ]


def category_change_rule(ctx: InsightContext) -> list[Insight]:
    period = "the same period last month" if ctx.is_month_to_date else "last month"
    candidates = []
    # Categories with no spending last month are skipped: there is no baseline to compare with.
    for category_id, previous in ctx.comparison_previous.items():
        current = ctx.comparison_current.get(category_id)
        current_total = current.total if current else ZERO
        difference = current_total - previous.total
        change = _percent(abs(difference), previous.total)
        if change < CATEGORY_CHANGE_MIN_PERCENT or abs(difference) < CATEGORY_CHANGE_MIN_AMOUNT:
            continue
        candidates.append((category_id, previous.name, difference, change))

    # Keep only the most significant changes so the list stays readable.
    candidates.sort(key=lambda candidate: abs(candidate[2]), reverse=True)

    insights = []
    for category_id, name, difference, change in candidates[:MAX_CATEGORY_CHANGE_INSIGHTS]:
        increased = difference > 0
        insight_type = InsightType.CATEGORY_INCREASE if increased else InsightType.CATEGORY_DECREASE
        verb = "increased" if increased else "decreased"
        insights.append(
            Insight(
                id=f"{insight_type}:{category_id}",
                type=insight_type,
                severity=Severity.WARNING if increased else Severity.POSITIVE,
                message=f"{name} spending {verb} by {whole_percent(change)}% compared to {period}.",
                category_id=category_id,
                amount=abs(difference),
                percentage=change,
            )
        )
    return insights


def budget_rule(ctx: InsightContext) -> list[Insight]:
    insights = []
    for usage in ctx.budget_usage:
        is_overall = usage["category_id"] is None
        spent, budget_amount = usage["spent_amount"], usage["budget_amount"]
        used = usage["usage_percentage"]

        if spent > budget_amount:
            over = spent - budget_amount
            subject = "Total spending" if is_overall else usage["category_name"]
            target = "the overall monthly budget" if is_overall else "its budget"
            insights.append(
                Insight(
                    id=f"{InsightType.BUDGET_EXCEEDED}:{usage['budget_id']}",
                    type=InsightType.BUDGET_EXCEEDED,
                    severity=Severity.ALERT,
                    message=f"{subject} exceeded {target} by {whole_percent(_percent(over, budget_amount))}%.",
                    category_id=usage["category_id"],
                    amount=over,
                    percentage=used,
                )
            )
        elif used >= BUDGET_WARNING_PERCENT:
            name = "your overall budget" if is_overall else f"the {usage['category_name']} budget"
            insights.append(
                Insight(
                    id=f"{InsightType.BUDGET_WARNING}:{usage['budget_id']}",
                    type=InsightType.BUDGET_WARNING,
                    severity=Severity.WARNING,
                    message=f"You have used {whole_percent(used)}% of {name}.",
                    category_id=usage["category_id"],
                    amount=budget_amount - spent,
                    percentage=used,
                )
            )
    return insights


def recurring_share_rule(ctx: InsightContext) -> list[Insight]:
    if not ctx.recurring_monthly_expenses or not ctx.total_income:
        return []
    share = _percent(ctx.recurring_monthly_expenses, ctx.total_income)
    return [
        Insight(
            id=InsightType.RECURRING_SHARE.value,
            type=InsightType.RECURRING_SHARE,
            severity=Severity.WARNING if share >= RECURRING_SHARE_WARNING_PERCENT else Severity.INFO,
            message=f"Recurring expenses represent {whole_percent(share)}% of income.",
            amount=ctx.recurring_monthly_expenses,
            percentage=share,
        )
    ]


def balance_rule(ctx: InsightContext) -> list[Insight]:
    # Without recorded income there is nothing meaningful to relate spending to.
    if not ctx.total_income:
        return []
    balance = ctx.total_income - ctx.total_expenses
    if balance < 0:
        deficit = -balance
        percentage = _percent(deficit, ctx.total_income)
        return [
            Insight(
                id=InsightType.OVERSPENDING.value,
                type=InsightType.OVERSPENDING,
                severity=Severity.ALERT,
                message=f"Expenses exceeded income by {whole_percent(percentage)}% this month.",
                amount=deficit,
                percentage=percentage,
            )
        ]
    if balance > 0:
        percentage = _percent(balance, ctx.total_income)
        return [
            Insight(
                id=InsightType.SAVINGS.value,
                type=InsightType.SAVINGS,
                severity=Severity.POSITIVE,
                message=f"You saved {whole_percent(percentage)}% of your income this month.",
                amount=balance,
                percentage=percentage,
            )
        ]
    return []


RULES = (
    budget_rule,
    balance_rule,
    category_change_rule,
    recurring_share_rule,
    top_category_rule,
)


def generate_insights(user, year: int, month: int, today: date) -> list[Insight]:
    ctx = build_context(user, year, month, today)
    insights = [insight for rule in RULES for insight in rule(ctx)]
    # Stable sort: most urgent first, rule order preserved within a severity.
    return sorted(insights, key=lambda insight: SEVERITY_ORDER[insight.severity])
