import calendar
from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, ExtractMonth

from apps.budgets.models import Budget, usage_figures
from apps.categories.models import TransactionType
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

ZERO = Decimal("0.00")
_DECIMAL = DecimalField(max_digits=12, decimal_places=2)


def month_date_range(year, month):
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    return start, end


def get_month_summary(user, year, month):
    start, end = month_date_range(year, month)
    result = Transaction.objects.filter(user=user, date__gte=start, date__lte=end).aggregate(
        total_income=Coalesce(
            Sum("amount", filter=Q(type=TransactionType.INCOME)), Value(ZERO), output_field=_DECIMAL
        ),
        total_expenses=Coalesce(
            Sum("amount", filter=Q(type=TransactionType.EXPENSE)), Value(ZERO), output_field=_DECIMAL
        ),
        transaction_count=Count("id"),
    )
    result["balance"] = result["total_income"] - result["total_expenses"]
    result["year"] = year
    result["month"] = month
    return result


def previous_month(year, month):
    return (year - 1, 12) if month == 1 else (year, month - 1)


def get_category_expense_rows(user, year, month):
    start, end = month_date_range(year, month)
    return get_category_expense_rows_between(user, start, end)


def get_category_expense_rows_between(user, start, end):
    return list(
        Transaction.objects.filter(user=user, type=TransactionType.EXPENSE, date__gte=start, date__lte=end)
        .values("category_id", "category__name")
        .annotate(total=Sum("amount"))
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


def get_budget_usage(user, year, month):
    """Every budget of the month with its usage. One query (see Budget.objects.with_spent)."""
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
            }
        )
    return usage


def get_dashboard(user, year, month):
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
        "budget_usage": get_budget_usage(user, year, month),
    }


def get_monthly_analytics(user, year):
    rows = (
        Transaction.objects.filter(user=user, date__year=year)
        .annotate(month_num=ExtractMonth("date"))
        .values("month_num")
        .annotate(
            income=Coalesce(
                Sum("amount", filter=Q(type=TransactionType.INCOME)), Value(ZERO), output_field=_DECIMAL
            ),
            expenses=Coalesce(
                Sum("amount", filter=Q(type=TransactionType.EXPENSE)), Value(ZERO), output_field=_DECIMAL
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


def get_comparison(user, year, month):
    prev_year, prev_month = previous_month(year, month)

    current = get_month_summary(user, year, month)
    previous = get_month_summary(user, prev_year, prev_month)

    def _diff(field):
        return current[field] - previous[field]

    def _pct_diff(field):
        if previous[field] == 0:
            return None
        return round((_diff(field) / previous[field]) * 100, 2)

    fields = ["total_income", "total_expenses", "balance"]
    return {
        "current_month": current,
        "previous_month": previous,
        "difference": {field: _diff(field) for field in fields},
        "percentage_difference": {field: _pct_diff(field) for field in fields},
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
