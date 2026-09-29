import calendar
from calendar import monthrange
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, ExtractMonth
from django.utils import timezone

from apps.budgets.models import Budget, usage_figures
from apps.categories.models import TransactionType
from apps.currencies.rates import MissingExchangeRateError, RateTable
from apps.subscriptions.services import get_month_overview as get_subscription_month_overview
from apps.transactions.models import RecurringTransaction, Transaction
from apps.transactions.recurrence import monthly_equivalent

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
    result = get_period_summary(user, *month_date_range(year, month))
    result["year"] = year
    result["month"] = month
    return result


def get_period_summary(user, start: date, end: date) -> dict:
    """Income, expenses, balance and transaction count from `start` to `end`, both included. One query."""
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
    """Four queries whatever the volume (one more when a subscription is billed in another currency)."""
    today = today or timezone.localdate()
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
        "subscriptions": get_subscription_month_overview(user, year, month, today),
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


def comparison_ranges(year: int, month: int, today: date, against=Against.PREVIOUS_MONTH):
    """(current range, compared range, is_month_to_date) for comparing a month with an earlier one.

    A month still in progress compared with a whole earlier month would show almost every
    category as "decreased" early in the month. So for the current month both periods are
    cut at today's day of the month (clamped to the compared month's length).
    """
    compared_year, compared_month_number = compared_month(year, month, against)
    current_start, current_end = month_date_range(year, month)
    previous_start, previous_end = month_date_range(compared_year, compared_month_number)

    is_month_to_date = (year, month) == (today.year, today.month)
    if is_month_to_date:
        current_end = today
        previous_end = previous_start.replace(day=min(today.day, previous_end.day))

    return (current_start, current_end), (previous_start, previous_end), is_month_to_date


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


def get_recurring_monthly_expenses(user, year, month, today: date | None = None):
    """Monthly-equivalent total of the recurring expenses active in the given month, in the base currency.

    Based on the RecurringTransaction templates themselves (not on generated
    transactions), normalized so weekly/yearly items are comparable with a
    month of income. One grouped query (a row per frequency and currency), plus one
    for exchange rates when a template is billed in another currency — converted at
    the rate of the month's last day (today's for the current month). A template whose
    currency has no rate of the last 7 days can't be converted and is left out.
    """
    start, end = month_date_range(year, month)
    rows = list(
        RecurringTransaction.objects.filter(
            user=user, type=TransactionType.EXPENSE, is_active=True, start_date__lte=end
        )
        .filter(Q(end_date__isnull=True) | Q(end_date__gte=start))
        .values("frequency", "currency")
        .annotate(total=Sum("amount"))
        .order_by()
    )
    base = user.base_currency
    day = min(end, today or timezone.localdate())
    foreign = {row["currency"] for row in rows} - {base}
    rates = RateTable.load(foreign | {base}, day, day) if foreign else RateTable()

    total = ZERO
    for row in rows:
        monthly = monthly_equivalent(row["total"], row["frequency"])
        if row["currency"] != base:
            try:
                monthly *= rates.rate(row["currency"], base, day).value
            except MissingExchangeRateError:
                continue
        total += monthly
    return to_cents(total)
