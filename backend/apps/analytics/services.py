import calendar
from calendar import monthrange
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, ExtractMonth
from django.utils import timezone

from apps.budgets.models import Budget, usage_figures
from apps.categories.models import TransactionType
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
# Totals of Transaction.base_amount, i.e. in the user's base currency.
MONEY_OUTPUT = DecimalField(max_digits=15, decimal_places=2)


class Against:
    """What a month is compared with (GET /api/analytics/comparison/?against=)."""

    PREVIOUS_MONTH = "previous_month"
    PREVIOUS_YEAR = "previous_year"
    CHOICES = [(PREVIOUS_MONTH, PREVIOUS_MONTH), (PREVIOUS_YEAR, PREVIOUS_YEAR)]


class BudgetStatus:
    ON_TRACK = "on_track"
    AHEAD_OF_PACE = "ahead_of_pace"  # more spent than the time elapsed allows, but not over the limit yet
    OVER_BUDGET = "over_budget"
    CHOICES = [(ON_TRACK, ON_TRACK), (AHEAD_OF_PACE, AHEAD_OF_PACE), (OVER_BUDGET, OVER_BUDGET)]


def to_cents(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def percentage_change(previous: Decimal, current: Decimal) -> Decimal | None:
    """Change from `previous` to `current` in %, 2 decimals; None without a baseline (previous = 0)."""
    if not previous:
        return None
    return round((current - previous) / previous * 100, 2)


def shift_month(year: int, month: int, months: int) -> tuple[int, int]:
    """(year, month) moved by `months`, across year boundaries."""
    years, month_index = divmod(month - 1 + months, 12)
    return year + years, month_index + 1


def month_date_range(year, month):
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    return start, end


def get_month_summary(user, year, month):
    start, end = month_date_range(year, month)
    result = Transaction.objects.filter(user=user, date__gte=start, date__lte=end).aggregate(
        total_income=Coalesce(
            Sum("base_amount", filter=Q(type=TransactionType.INCOME)), Value(ZERO), output_field=MONEY_OUTPUT
        ),
        total_expenses=Coalesce(
            Sum("base_amount", filter=Q(type=TransactionType.EXPENSE)), Value(ZERO), output_field=MONEY_OUTPUT
        ),
        transaction_count=Count("id"),
    )
    result["balance"] = result["total_income"] - result["total_expenses"]
    result["year"] = year
    result["month"] = month
    return result


def previous_month(year, month):
    return shift_month(year, month, -1)


def get_category_expense_rows(user, year, month):
    start, end = month_date_range(year, month)
    return get_category_expense_rows_between(user, start, end)


def get_category_expense_rows_between(user, start, end):
    return list(
        Transaction.objects.filter(user=user, type=TransactionType.EXPENSE, date__gte=start, date__lte=end)
        .values("category_id", "category__name")
        .annotate(total=Sum("base_amount"))
        .order_by("-total")
    )


def get_category_breakdown(user, year, month):
    rows = get_category_expense_rows(user, year, month)
    total_expenses = sum((row["total"] for row in rows), ZERO)
    breakdown = []
    for row in rows:
        percentage = round((row["total"] / total_expenses) * 100, 2) if total_expenses else ZERO
        breakdown.append(
            {
                "category_id": row["category_id"],
                "category_name": row["category__name"],
                "amount": row["total"],
                "percentage": percentage,
            }
        )
    return breakdown


def get_top_spending_category(category_rows):
    if not category_rows:
        return None
    top = category_rows[0]
    return {
        "category_id": top["category_id"],
        "category_name": top["category__name"],
        "amount": top["total"],
    }


def elapsed_fraction(year: int, month: int, today: date) -> Decimal:
    """How much of the month has passed on `today`: 0 before it, 1 after it, day / days in between."""
    start, end = month_date_range(year, month)
    if today < start:
        return Decimal(0)
    if today >= end:
        return Decimal(1)
    return Decimal(today.day) / Decimal(end.day)


def budget_variance(amount: Decimal, spent: Decimal, elapsed: Decimal) -> dict:
    """Budget vs actual: the variance in % and whether spending keeps pace with the month."""
    expected_to_date = to_cents(amount * elapsed)
    if spent > amount:
        status = BudgetStatus.OVER_BUDGET
    elif spent > expected_to_date:
        status = BudgetStatus.AHEAD_OF_PACE
    else:
        status = BudgetStatus.ON_TRACK
    return {
        # Above (+) or below (−) the limit, in % of the limit.
        "variance_percentage": round((spent - amount) / amount * 100, 2),
        # What the budget allows by today if spread evenly over the month.
        "expected_to_date": expected_to_date,
        "status": status,
    }


def get_budget_usage(user, year, month, today: date | None = None):
    """Every budget of the month with its usage and variance. One query (see Budget.objects.with_spent)."""
    elapsed = elapsed_fraction(year, month, today or timezone.localdate())
    budgets = Budget.objects.filter(user=user, year=year, month=month).select_related("category").with_spent()
    usage = []
    for budget in budgets:
        remaining, percentage = usage_figures(budget.amount, budget.spent)
        usage.append(
            {
                "budget_id": budget.id,
                "category_id": budget.category_id,
                "category_name": budget.category.name if budget.category_id else "Overall",
                "budget_amount": budget.amount,
                "spent_amount": budget.spent,
                "remaining_amount": remaining,
                "usage_percentage": percentage,
                **budget_variance(budget.amount, budget.spent, elapsed),
            }
        )
    return usage


def get_dashboard(user, year, month, today: date | None = None):
    summary = get_month_summary(user, year, month)
    category_rows = get_category_expense_rows(user, year, month)
    return {
        "year": year,
        "month": month,
        "total_income": summary["total_income"],
        "total_expenses": summary["total_expenses"],
        "balance": summary["balance"],
        "transaction_count": summary["transaction_count"],
        "top_spending_category": get_top_spending_category(category_rows),
        "budget_usage": get_budget_usage(user, year, month, today),
    }


def get_monthly_analytics(user, year):
    rows = (
        Transaction.objects.filter(user=user, date__year=year)
        .annotate(month_num=ExtractMonth("date"))
        .values("month_num")
        .annotate(
            income=Coalesce(
                Sum("base_amount", filter=Q(type=TransactionType.INCOME)), Value(ZERO), output_field=MONEY_OUTPUT
            ),
            expenses=Coalesce(
                Sum("base_amount", filter=Q(type=TransactionType.EXPENSE)), Value(ZERO), output_field=MONEY_OUTPUT
            ),
        )
    )
    by_month = {row["month_num"]: row for row in rows}

    months = []
    for month_num in range(1, 13):
        row = by_month.get(month_num, {"income": ZERO, "expenses": ZERO})
        income = row["income"]
        expenses = row["expenses"]
        months.append(
            {
                "month": month_num,
                "month_name": calendar.month_name[month_num],
                "income": income,
                "expenses": expenses,
                "balance": income - expenses,
            }
        )
    return months


def compared_month(year, month, against=Against.PREVIOUS_MONTH):
    if against == Against.PREVIOUS_YEAR:
        return year - 1, month
    return previous_month(year, month)


def get_category_comparison(user, current_range, previous_range):
    """Each expense category's spending in two periods, with the change. One query for both periods."""
    in_current = Q(date__range=current_range)
    in_previous = Q(date__range=previous_range)
    rows = (
        Transaction.objects.filter(user=user, type=TransactionType.EXPENSE)
        .filter(in_current | in_previous)
        .values("category_id", "category__name")
        .annotate(
            current=Coalesce(Sum("base_amount", filter=in_current), Value(ZERO), output_field=MONEY_OUTPUT),
            previous=Coalesce(Sum("base_amount", filter=in_previous), Value(ZERO), output_field=MONEY_OUTPUT),
        )
        .order_by("-current", "category__name")
    )
    return [
        {
            "category_id": row["category_id"],
            "category_name": row["category__name"],
            "current_amount": row["current"],
            "previous_amount": row["previous"],
            "change_amount": row["current"] - row["previous"],
            "change_percentage": percentage_change(row["previous"], row["current"]),
        }
        for row in rows
    ]


def get_comparison(user, year, month, against=Against.PREVIOUS_MONTH):
    """The month against the previous month, or the same month a year earlier. Three queries."""
    prev_year, prev_month = compared_month(year, month, against)

    current = get_month_summary(user, year, month)
    previous = get_month_summary(user, prev_year, prev_month)

    def _diff(field):
        return current[field] - previous[field]

    fields = ["total_income", "total_expenses", "balance"]
    return {
        "against": against,
        "current_month": current,
        # Kept under its original name: the month compared against (a year earlier with previous_year).
        "previous_month": previous,
        "difference": {field: _diff(field) for field in fields},
        "percentage_difference": {field: percentage_change(previous[field], current[field]) for field in fields},
        "categories": get_category_comparison(
            user, month_date_range(year, month), month_date_range(prev_year, prev_month)
        ),
    }


# How many times per month each frequency occurs on average (weekly = 52 / 12).
MONTHLY_OCCURRENCES = {
    Frequency.WEEKLY: Decimal(52) / Decimal(12),
    Frequency.MONTHLY: Decimal(1),
    Frequency.YEARLY: Decimal(1) / Decimal(12),
}


def get_recurring_monthly_expenses(user, year, month):
    """Monthly-equivalent total of the recurring expenses active in the given month.

    Based on the RecurringTransaction templates themselves (not on generated
    transactions), normalized so weekly/yearly items are comparable with a
    month of income. Single grouped query: one row per frequency at most.
    """
    start, end = month_date_range(year, month)
    rows = (
        RecurringTransaction.objects.filter(
            user=user, type=TransactionType.EXPENSE, is_active=True, start_date__lte=end
        )
        .filter(Q(end_date__isnull=True) | Q(end_date__gte=start))
        .values("frequency")
        .annotate(total=Sum("amount"))
    )
    total = sum((row["total"] * MONTHLY_OCCURRENCES[row["frequency"]] for row in rows), ZERO)
    return total.quantize(Decimal("0.01"))
