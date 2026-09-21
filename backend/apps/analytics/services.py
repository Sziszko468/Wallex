import calendar
from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, ExtractMonth

from apps.budgets.models import Budget
from apps.categories.models import TransactionType
from apps.transactions.models import Transaction

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


def get_category_expense_rows(user, year, month):
    start, end = month_date_range(year, month)
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


def get_budget_usage(user, year, month, category_rows=None):
    if category_rows is None:
        category_rows = get_category_expense_rows(user, year, month)
    category_totals = {row["category_id"]: row["total"] for row in category_rows}
    overall_spent = sum(category_totals.values(), ZERO)

    budgets = Budget.objects.filter(user=user, year=year, month=month).select_related("category")
    usage = []
    for budget in budgets:
        spent = category_totals.get(budget.category_id, ZERO) if budget.category_id else overall_spent
        usage.append(
            {
                "budget_id": budget.id,
                "category_id": budget.category_id,
                "category_name": budget.category.name if budget.category_id else "Overall",
                "budget_amount": budget.amount,
                "spent_amount": spent,
                "remaining_amount": budget.amount - spent,
                "usage_percentage": round((spent / budget.amount) * 100, 2),
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
        "budget_usage": get_budget_usage(user, year, month, category_rows=category_rows),
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
    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1

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
