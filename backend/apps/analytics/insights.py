"""Rule-based financial insights.

All data is fetched up front into an ``InsightContext`` (a fixed number of
queries), then every rule is a pure function ``InsightContext -> list[Insight]``.
Adding a rule therefore never adds a query, and each rule can be unit-tested
without touching the database.
"""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy

from apps.categories.defaults import display_name

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
    # Period-aligned totals for the month-over-month comparison (see services.comparison_ranges).
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
    return {row["category_id"]: CategoryTotal(display_name(row["category__name"]), row["total"]) for row in rows}


def build_context(user, year: int, month: int, today: date) -> InsightContext:
    """Fetch everything the rules need. Always exactly 6 queries."""
    summary = services.get_month_summary(user, year, month)
    category_rows = services.get_category_expense_rows(user, year, month)
    # Month-to-date on both sides for the current month (see services.comparison_ranges).
    current_range, previous_range, is_month_to_date = services.comparison_ranges(year, month, today)

    return InsightContext(
        total_income=summary["total_income"],
        total_expenses=summary["total_expenses"],
        category_totals=list(_totals_by_category(category_rows).items()),
        comparison_current=_totals_by_category(services.get_category_expense_rows_between(user, *current_range)),
        comparison_previous=_totals_by_category(services.get_category_expense_rows_between(user, *previous_range)),
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
            message=_("Highest spending category is %(name)s (%(percent)s%% of this month's expenses).")
            % {"name": top.name, "percent": whole_percent(share)},
            category_id=category_id,
            amount=top.total,
            percentage=share,
        )
    ]


def category_change_rule(ctx: InsightContext) -> list[Insight]:
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
        message = _CHANGE_MESSAGES[(increased, ctx.is_month_to_date)] % {"name": name, "percent": whole_percent(change)}
        insights.append(
            Insight(
                id=f"{insight_type}:{category_id}",
                type=insight_type,
                severity=Severity.WARNING if increased else Severity.POSITIVE,
                message=message,
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
            percent = whole_percent(_percent(over, budget_amount))
            message = (
                _("Total spending exceeded the overall monthly budget by %(percent)s%%.") % {"percent": percent}
                if is_overall
                else _("%(name)s exceeded its budget by %(percent)s%%.")
                % {"name": usage["category_name"], "percent": percent}
            )
            insights.append(
                Insight(
                    id=f"{InsightType.BUDGET_EXCEEDED}:{usage['budget_id']}",
                    type=InsightType.BUDGET_EXCEEDED,
                    severity=Severity.ALERT,
                    message=message,
                    category_id=usage["category_id"],
                    amount=over,
                    percentage=used,
                )
            )
        elif used >= BUDGET_WARNING_PERCENT:
            message = (
                _("You have used %(percent)s%% of your overall budget.") % {"percent": whole_percent(used)}
                if is_overall
                else _("You have used %(percent)s%% of the %(name)s budget.")
                % {"percent": whole_percent(used), "name": usage["category_name"]}
            )
            insights.append(
                Insight(
                    id=f"{InsightType.BUDGET_WARNING}:{usage['budget_id']}",
                    type=InsightType.BUDGET_WARNING,
                    severity=Severity.WARNING,
                    message=message,
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
            message=_("Recurring expenses represent %(percent)s%% of income.") % {"percent": whole_percent(share)},
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
                message=_("Expenses exceeded income by %(percent)s%% this month.")
                % {"percent": whole_percent(percentage)},
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
                message=_("You saved %(percent)s%% of your income this month.")
                % {"percent": whole_percent(percentage)},
                amount=balance,
                percentage=percentage,
            )
        ]
    return []


# (increased?, month to date?) -> the sentence; whole sentences, as word order differs between languages.
_CHANGE_MESSAGES = {
    (True, True): gettext_lazy("%(name)s spending increased by %(percent)s%% compared to the same period last month."),
    (True, False): gettext_lazy("%(name)s spending increased by %(percent)s%% compared to last month."),
    (False, True): gettext_lazy("%(name)s spending decreased by %(percent)s%% compared to the same period last month."),
    (False, False): gettext_lazy("%(name)s spending decreased by %(percent)s%% compared to last month."),
}

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
